/**
 * Telling somebody that a scheduled scan found something.
 *
 * A scan started from the discovery dialog reports to the person watching it. A scan on a timer
 * has nobody watching: admin subscribes to `system.discovery` only while that dialog is open,
 * so the result of a nightly scan would sit in the object until somebody happens to look. This
 * is the other half of it - a js-controller notification, which admin shows in its bell, and a
 * jsonConfig schema for the detail view of that notification.
 *
 * The decisions are here and not in `main.ts` because `main.ts` replaces its own
 * `module.exports` for compact mode and can therefore export nothing a test could reach.
 */

import type { DiscoveryInstance, InstanceComment } from './types';

/** The scope and category declared in `io-package.json` under `notifications` */
export const NOTIFICATION_SCOPE = 'discovery';
export const NOTIFICATION_CATEGORY = 'newInstances';

/**
 * What a proposal is reduced to for the notification.
 *
 * The full proposal carries the whole `native` configuration of the instance to be created;
 * none of that belongs in a notification that is stored, moved around and handed back to us by
 * admin. Name and comment are what the detail view shows.
 */
export interface ProposalSummary {
    /** `system.adapter.<name>.<n>` */
    id: string;
    /** the adapter that would be created */
    name: string;
    /** what the detection module wrote about the find, already flattened to one line */
    comment?: string;
}

const TEXTS = {
    /** one new proposal */
    one: {
        en: 'The scheduled scan found a new adapter proposal',
        de: 'Der zeitgesteuerte Suchlauf hat einen neuen Adaptervorschlag gefunden',
        ru: 'Запланированное сканирование нашло новое предложение адаптера',
        pt: 'A verificação programada encontrou uma nova proposta de adaptador',
        nl: 'De geplande scan vond een nieuw adaptervoorstel',
        fr: 'La recherche planifiée a trouvé une nouvelle proposition d’adaptateur',
        it: 'La scansione pianificata ha trovato una nuova proposta di adattatore',
        es: 'La búsqueda programada encontró una nueva propuesta de adaptador',
        pl: 'Zaplanowane wyszukiwanie znalazło nową propozycję adaptera',
        uk: 'Запланований пошук знайшов нову пропозицію адаптера',
        'zh-cn': '定时扫描发现了一个新的适配器建议',
    },
    /** more than one, `%s` is the number */
    many: {
        en: 'The scheduled scan found %s new adapter proposals',
        de: 'Der zeitgesteuerte Suchlauf hat %s neue Adaptervorschläge gefunden',
        ru: 'Запланированное сканирование нашло новых предложений адаптеров: %s',
        pt: 'A verificação programada encontrou %s novas propostas de adaptadores',
        nl: 'De geplande scan vond %s nieuwe adaptervoorstellen',
        fr: 'La recherche planifiée a trouvé %s nouvelles propositions d’adaptateurs',
        it: 'La scansione pianificata ha trovato %s nuove proposte di adattatori',
        es: 'La búsqueda programada encontró %s nuevas propuestas de adaptadores',
        pl: 'Zaplanowane wyszukiwanie znalazło %s nowych propozycji adapterów',
        uk: 'Запланований пошук знайшов %s нових пропозицій адаптерів',
        'zh-cn': '定时扫描发现了 %s 个新的适配器建议',
    },
    header: {
        en: 'New adapter proposals',
        de: 'Neue Adaptervorschläge',
        ru: 'Новые предложения адаптеров',
        pt: 'Novas propostas de adaptadores',
        nl: 'Nieuwe adaptervoorstellen',
        fr: 'Nouvelles propositions d’adaptateurs',
        it: 'Nuove proposte di adattatori',
        es: 'Nuevas propuestas de adaptadores',
        pl: 'Nowe propozycje adapterów',
        uk: 'Нові пропозиції адаптерів',
        'zh-cn': '新的适配器建议',
    },
    hint: {
        en: 'Open "Discover devices and services" - the eye in the toolbar - to create them or to mark them as ignored.',
        de: 'Öffne "Geräte und Dienste finden" - das Auge in der Werkzeugleiste - um sie anzulegen oder als ignoriert zu markieren.',
        ru: 'Откройте «Поиск устройств и сервисов» - глаз на панели инструментов - чтобы создать их или отметить как игнорируемые.',
        pt: 'Abra "Encontrar dispositivos e serviços" - o olho na barra de ferramentas - para os criar ou marcar como ignorados.',
        nl: 'Open "Apparaten en diensten zoeken" - het oog in de werkbalk - om ze aan te maken of als genegeerd te markeren.',
        fr: 'Ouvrez « Trouver les appareils et services » - l’œil dans la barre d’outils - pour les créer ou les marquer comme ignorés.',
        it: 'Apri "Trova dispositivi e servizi" - l’occhio nella barra degli strumenti - per crearli o segnarli come ignorati.',
        es: 'Abre "Buscar dispositivos y servicios" - el ojo de la barra de herramientas - para crearlos o marcarlos como ignorados.',
        pl: 'Otwórz „Znajdź urządzenia i usługi" - oko na pasku narzędzi - aby je utworzyć lub oznaczyć jako ignorowane.',
        uk: 'Відкрийте «Пошук пристроїв і сервісів» - око на панелі інструментів - щоб створити їх або позначити як ігноровані.',
        'zh-cn': '打开工具栏上的眼睛图标「查找设备和服务」，即可创建它们或将其标记为忽略。',
    },
    offline: {
        en: 'The discovery instance is not running, so the proposals cannot be listed here.',
        de: 'Die Discovery-Instanz läuft nicht, deshalb können die Vorschläge hier nicht aufgelistet werden.',
        ru: 'Экземпляр discovery не запущен, поэтому предложения здесь не показать.',
        pt: 'A instância discovery não está a correr, por isso as propostas não podem ser listadas aqui.',
        nl: 'De discovery-instantie draait niet, daarom kunnen de voorstellen hier niet worden getoond.',
        fr: 'L’instance discovery ne tourne pas, les propositions ne peuvent donc pas être listées ici.',
        it: 'L’istanza discovery non è in esecuzione, quindi le proposte non possono essere elencate qui.',
        es: 'La instancia discovery no está en marcha, por lo que las propuestas no se pueden listar aquí.',
        pl: 'Instancja discovery nie działa, więc propozycji nie da się tutaj wyświetlić.',
        uk: 'Екземпляр discovery не запущено, тому пропозиції тут не показати.',
        'zh-cn': 'discovery 实例未运行，因此无法在此列出这些建议。',
    },
    gone: {
        en: 'Nothing is left of this notification - the proposals were created or ignored in the meantime.',
        de: 'Von dieser Benachrichtigung ist nichts übrig - die Vorschläge wurden inzwischen angelegt oder ignoriert.',
        ru: 'От этого уведомления ничего не осталось - предложения уже созданы или проигнорированы.',
        pt: 'Não resta nada desta notificação - as propostas já foram criadas ou ignoradas.',
        nl: 'Van deze melding is niets over - de voorstellen zijn inmiddels aangemaakt of genegeerd.',
        fr: 'Il ne reste rien de cette notification - les propositions ont été créées ou ignorées entre-temps.',
        it: 'Di questa notifica non resta nulla - le proposte sono state create o ignorate nel frattempo.',
        es: 'No queda nada de esta notificación: las propuestas ya se crearon o se ignoraron.',
        pl: 'Z tego powiadomienia nic nie zostało - propozycje zostały już utworzone lub zignorowane.',
        uk: 'Від цього сповіщення нічого не залишилося - пропозиції вже створено або проігноровано.',
        'zh-cn': '此通知已无内容 — 这些建议同时已被创建或忽略。',
    },
} as const;

/** The offline text admin shows instead of the detail view when this instance is stopped */
export const OFFLINE_MESSAGE: ioBroker.Translated = { ...TEXTS.offline };

/**
 * The id of a proposal, whatever shape it was stored in.
 *
 * `system.discovery` has carried plain strings in older versions, and the acknowledge logic in
 * `main.ts` turns entries into JSON on the way, so this has to cope with both.
 *
 * @param entry one entry of `native.newInstances`
 */
function proposalId(entry: DiscoveryInstance | string | null | undefined): string | null {
    if (typeof entry === 'string') {
        try {
            return (JSON.parse(entry) as DiscoveryInstance)?._id || null;
        } catch {
            return entry || null;
        }
    }
    return entry?._id || null;
}

/**
 * The proposals of this scan that were not in the one before and that nobody has ignored.
 *
 * "Not there before" and not "not acknowledged" is the point: an hourly scan reports the same
 * finds over and over, and only the first time is news. A proposal the user ignored keeps its
 * `comment.ack` across scans (see the acknowledge block in `main.ts`), so it never comes back
 * as new either.
 *
 * @param previous `native.newInstances` as it was stored before this scan
 * @param current what this scan proposes
 */
export function newProposals(
    previous: (DiscoveryInstance | string)[] | undefined | null,
    current: DiscoveryInstance[] | undefined | null,
): DiscoveryInstance[] {
    const known = new Set<string>();
    for (const entry of previous || []) {
        const id = proposalId(entry);
        if (id) {
            known.add(id);
        }
    }

    return (current || []).filter(instance => instance?._id && !instance.comment?.ack && !known.has(instance._id));
}

/**
 * The comment of a proposal as one line, the way the discovery dialog builds it.
 *
 * @param comment the comment of the proposal
 */
export function commentText(comment: InstanceComment | undefined): string {
    const parts: string[] = [];

    for (const key of ['add', 'changed', 'extended'] as const) {
        const value = comment?.[key];
        if (!value) {
            continue;
        }
        if (Array.isArray(value)) {
            parts.push(value.length <= 5 ? `${key}: ${value.join(', ')}` : `${key}: ${value.length}`);
        } else {
            parts.push(`${key}: ${String(value)}`);
        }
    }

    if (comment?.text) {
        parts.push(comment.text);
    }

    return parts.join(', ');
}

/**
 * The proposals reduced to what the notification carries.
 *
 * @param proposals the proposals of the last scan that are new
 */
export function summarise(proposals: DiscoveryInstance[]): ProposalSummary[] {
    return proposals.map(instance => {
        const comment = commentText(instance.comment);
        return {
            id: instance._id,
            name: instance.common?.name || instance._id.split('.')[2] || instance._id,
            ...(comment ? { comment } : {}),
        };
    });
}

/**
 * The one line the notification list shows.
 *
 * @param count how many proposals are new
 * @param language the language of this installation
 */
export function message(count: number, language?: ioBroker.Languages): string {
    const lang: ioBroker.Languages = language && TEXTS.one[language] ? language : 'en';
    return count === 1 ? TEXTS.one[lang] : TEXTS.many[lang].replace('%s', String(count));
}

/**
 * The detail view of the notification, as a jsonConfig panel.
 *
 * Admin asks for this with `admin:getNotificationSchema` and renders whatever comes back, so
 * the texts are handed over as translation objects and no language has to be guessed. It only
 * lists - creating an instance is a decision with a form behind it, and that lives in the
 * discovery dialog.
 *
 * @param proposals the summaries stored in the notification
 */
export function notificationSchema(proposals: ProposalSummary[] | undefined | null): Record<string, unknown> {
    const items: Record<string, unknown> = {
        _header: {
            type: 'header',
            size: 5,
            text: { ...TEXTS.header },
            sm: 12,
        },
    };

    if (!proposals?.length) {
        items._gone = {
            newLine: true,
            type: 'staticText',
            text: { ...TEXTS.gone },
            sm: 12,
        };
        return { type: 'panel', items };
    }

    proposals.forEach((proposal, i) => {
        items[`_proposal_${i}`] = {
            newLine: true,
            type: 'staticText',
            noTranslation: true,
            text: proposal.comment ? `${proposal.name} - ${proposal.comment}` : proposal.name,
            sm: 12,
            style: { marginTop: 4 },
        };
    });

    items._hint = {
        newLine: true,
        type: 'staticText',
        text: { ...TEXTS.hint },
        sm: 12,
        style: { marginTop: 12, fontStyle: 'italic' },
    };

    return { type: 'panel', items };
}
