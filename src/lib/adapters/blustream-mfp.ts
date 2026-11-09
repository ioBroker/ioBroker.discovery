import * as tools from '../tools';
import type { DetectCallback, DetectOptions, DiscoveryDevice } from '../types';

const adapterName = 'blustream-mfp';

/**
 * Blustream presentation switchers, HDBaseT/HDMI matrices, video-wall processors and the USB
 * matrix, over their telnet control port.
 *
 * A unit greets a new connection with `Please Input Your Command :` (the C series; others may
 * stay silent or show a `MODEL>` prompt) and answers `STATUS` with a table that opens like this:
 *
 * ```
 * ================================================================
 *               C66 6x6 HDBaseT Matrix
 *               FW Version: V1.0.1d
 * ```
 *
 * The probe listens first and writes only after silence or a greeting of that kind - anything
 * else on port 23, a login prompt above all, is left alone without a byte sent. It then sends
 * the read-only `STATUS` and needs the rule line followed by a `FW Version` line. The model name
 * of the header picks the adapter's `deviceModel`; a model the adapter does not know is not
 * proposed, because the adapter would fall back to the wrong model.
 *
 * Header layouts are taken from STATUS replies of C66, C88CS, CMX44CS-V2, HMX88-18G,
 * HMXL42ARC-KIT, MFP72, MFP112, MV41, MX44AVW, MX44KVM, SW21AB-V3, SW41AB-8K, SW41HDBT and
 * SW42DA-V2 units.
 */
const TELNET_PORT = 23;
/** how long a silent unit is given before the probe writes */
const GREETING_WAIT = 600;
const PROBE_TIMEOUT = 2500;
// main.ts arms its watchdog with this before it calls detect(), so leave the probe room
const DETECT_TIMEOUT = PROBE_TIMEOUT + 300;
/** the STATUS header is in the first lines; give up on a talkative stranger after this */
const MAX_ANSWER = 4096;

/** `deviceModel` of the adapter for each model name the units print in their STATUS header */
const MODELS: Record<string, string> = {
    AMF42AU: 'amf42au',
    MFP62: 'mfp62',
    MFP72: 'mfp72',
    MFP112: 'mfp112',
    WMF51: 'wmf51',
    WMF72: 'wmf72',
    C66: 'c66',
    C88: 'c88',
    'C44-KIT': 'c44kit',
    'C44CS-KIT': 'c44cs',
    C66CS: 'c66cs',
    C88CS: 'c88cs',
    'HMXL42ARC-KIT': 'hmxl42arc',
    'HMXL44CS-KIT': 'hmxl44cs',
    'HMXL44ARC-KIT': 'hmxl44arc',
    HMXL66ARC: 'hmxl66arc',
    HMXL88ARC: 'hmxl88arc',
    'HMXL88-V2': 'hmxl88v2',
    'HMX44-18G-KIT': 'hmx44_18g',
    'HMX88-18G': 'hmx88_18g',
    PLA88CS: 'pla88cs',
    'PLA88ARC-V2': 'pla88arc',
    'PLA88L-V2': 'pla88l',
    PRO48HBT70: 'pro48hbt',
    PRO48HBT70CS: 'pro48hbtcs',
    PRO88HBT70CS: 'pro88hbtcs',
    'PRO88HDMI-V2': 'pro88hdmi',
    PRO16HBT70CS: 'pro16hbtcs',
    'CUSTOMPRO-HUB': 'custompro',
    'CUSTOMPRO-HUB16': 'custompro16',
    CMX42CS: 'cmx42cs',
    'CMX44CS-V2': 'cmx44cs',
    CMX44AB: 'cmx44ab',
    CMX88CS: 'cmx88cs',
    CMX88AB: 'cmx88ab',
    'MX22AB-8K': 'mx22ab8k',
    'MX44AB-V2': 'mx44abv2',
    SW41HDBT: 'sw41hdbt',
    'SW41AB-V2': 'sw41abv2',
    'SW41AB-8K': 'sw41ab8k',
    SW42DA: 'sw42da',
    'SW21AB-V2': 'sw21abv2',
    'SW21AB-V3': 'sw21abv3',
    MX44VW: 'mx44vw',
    MX44AVW: 'mx44avw',
    MV41: 'mv41',
    MX44KVM: 'mx44kvm',
};

/** `C44CS-KIT` and `C44CS` are the same unit to the adapter; dashes are not reliable either */
function normalise(name: string): string {
    return name
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '')
        .replace(/KIT$/, '');
}

const NORMALISED = Object.entries(MODELS).map(([name, key]) => ({ name: normalise(name), key }));

/**
 * The adapter's `deviceModel` for the model name of a STATUS header, or `null` if the adapter
 * has no such model. A hardware revision suffix the adapter does not tell apart (`SW42DA-V2`)
 * falls back to the base model; nothing else does, so `C66CS` never becomes `C66`.
 *
 * @param headerModel the model name as the unit prints it
 */
export function modelKey(headerModel: string): string | null {
    const wanted = normalise(headerModel);
    const exact = NORMALISED.find(m => m.name === wanted);
    if (exact) {
        return exact.key;
    }
    const base = NORMALISED.find(m => wanted.startsWith(m.name) && /^V\d+$/.test(wanted.slice(m.name.length)));
    return base ? base.key : null;
}

/** Telnet option negotiation (IAC ...) carries no text - drop it before reading a greeting */
function stripTelnet(text: string): string {
    return text.replace(/\xff[\xfb-\xfe][\s\S]|\xff[\xf0-\xfa]/g, '');
}

/**
 * Judge what the device said before anything was sent.
 *
 * `'go'` means a Blustream greeting, `'wait'` nothing conclusive yet (silence included),
 * `'stop'` another service - a login prompt or any other banner - that must not be written to.
 *
 * @param greeting the bytes received so far
 * @param final true once the greeting wait is over
 */
export function judgeGreeting(greeting: Buffer, final = false): 'go' | 'wait' | 'stop' {
    const text = stripTelnet(greeting.toString('latin1'));
    if (/login|user|passw|name\s*:/i.test(text)) {
        return 'stop';
    }
    if (/Please Input Your Command/i.test(text)) {
        return 'go';
    }
    const trimmed = text.trim();
    if (!final) {
        return 'wait';
    }
    if (!trimmed || /^[\w-]+>$/.test(trimmed)) {
        return 'go';
    }
    return 'stop';
}

/**
 * Find the STATUS header in an answer: a rule of `=`, then within the next three non-empty
 * lines a `FW Version` line, with the model line between them.
 *
 * Returns the model name, `''` for a header without a model line, or `null` if no header has
 * arrived (yet). Only complete lines count.
 *
 * @param answer the bytes received after `STATUS` was sent
 */
export function parseStatusHeader(answer: Buffer): string | null {
    const lines = answer.toString('latin1').split(/\r\n|\r|\n/);
    lines.pop(); // the last piece has no line end yet

    for (let i = 0; i < lines.length; i++) {
        if (!/={40,}/.test(lines[i])) {
            continue;
        }
        const next = lines
            .slice(i + 1)
            .map(line => line.trim())
            .filter(line => line)
            .slice(0, 3);
        const fw = next.findIndex(line => /FW Version/i.test(line));
        if (fw === -1) {
            continue;
        }
        const modelLine = next.slice(0, fw).find(line => !/={10,}/.test(line)) || '';
        // `HDMI MFP72  Status`, `SW41HDBT - 4x1 HDBaseT Switch`, `C66 6x6 HDBaseT Matrix`
        return modelLine.replace(/^HDMI\s+/i, '').split(/\s+/)[0] || '';
    }
    return null;
}

function addInstance(ip: string, port: number, model: string, deviceModel: string, options: DetectOptions): boolean {
    const instance = tools.findInstance(
        options,
        adapterName,
        obj => obj.native.connectionType === 'ip' && obj.native.ipAddress === ip,
    );

    if (instance) {
        options.log.debug(`blustream-mfp adapter already present for ${ip}`);
        return false;
    }

    options.newInstances.push({
        _id: tools.getNextInstanceID(adapterName, options),
        common: {
            name: adapterName,
            title: `Blustream ${model} (${ip})`,
        },
        native: {
            connectionType: 'ip',
            ipAddress: ip,
            ipPort: port,
            deviceModel,
        },
        comment: {
            add: [`Blustream ${model} (${ip})`],
        },
    });

    return true;
}

/**
 * Probe one port of an address - `detect()` with the port open, so the tests can use a port
 * that needs no privileges.
 *
 * @param ip address of the device
 * @param port telnet port of the unit
 * @param options the detection state of this scan
 * @param callback called once with the result
 */
export function probe(ip: string, port: number, options: DetectOptions, callback: DetectCallback): void {
    let greeting = Buffer.alloc(0);
    let answer = Buffer.alloc(0);
    let sent = false;
    let model: string | null = null;
    let greetingTimer: NodeJS.Timeout | null = null;

    const sendStatus = (client: { destroyed: boolean; write: (data: string) => unknown }): void => {
        if (!sent && !client.destroyed) {
            sent = true;
            client.write('STATUS\r');
        }
    };

    tools.testPort(
        ip,
        port,
        PROBE_TIMEOUT,
        {
            onConnect: (_ip, _port, client): void => {
                greetingTimer = setTimeout((): void => {
                    greetingTimer = null;
                    if (judgeGreeting(greeting, true) === 'go') {
                        sendStatus(client);
                    } else {
                        // a stranger: say nothing and let the probe run out
                        client.destroy();
                    }
                }, GREETING_WAIT);
            },
            onReceive: (data, _ip, _port, client): tools.PortReceiveResult => {
                if (!sent) {
                    greeting = Buffer.concat([greeting, data]);
                    const verdict = judgeGreeting(greeting);
                    if (verdict === 'stop') {
                        return false;
                    }
                    if (verdict === 'go') {
                        sendStatus(client);
                    }
                    return null;
                }

                answer = Buffer.concat([answer, data]);
                model = parseStatusHeader(answer);
                if (model !== null) {
                    return true;
                }
                return answer.length > MAX_ANSWER ? false : null;
            },
        },
        (err, found): void => {
            if (greetingTimer) {
                clearTimeout(greetingTimer);
                greetingTimer = null;
            }
            if (err || !found || model === null) {
                return callback(null, false, ip);
            }

            const deviceModel = modelKey(model);
            if (!deviceModel) {
                options.log.debug(
                    `Blustream unit "${model}" at ${ip} is not a model the blustream-mfp adapter supports`,
                );
                return callback(null, false, ip);
            }

            options.log.debug(`Blustream ${model} detected at ${ip}`);
            callback(null, addInstance(ip, port, model, deviceModel, options), ip);
        },
    );
}

export function detect(ip: string, device: DiscoveryDevice, options: DetectOptions, callback: DetectCallback): void {
    probe(ip, TELNET_PORT, options, callback);
}

export const type = ['ip'];
export const timeout = DETECT_TIMEOUT;
