import React from 'react';

import {
    Box,
    Chip,
    IconButton,
    InputAdornment,
    LinearProgress,
    Paper,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    TableSortLabel,
    TextField,
    Typography,
} from '@mui/material';
import { Close, Search } from '@mui/icons-material';
import { I18n, Icon, Utils } from '@iobroker/gui-components';
import { ConfigGeneric, type ConfigGenericProps, type ConfigGenericState } from '@iobroker/json-config';

import type { DiscoveryDevice, SortColumn } from './types';

/** The `once` pseudo device stands for the host itself and was never found on the network */
const NOT_A_DEVICE = '0.0.0.0';

const COLUMNS: { id: SortColumn; label: string; width?: number }[] = [
    { id: 'address', label: 'custom_discovery_address', width: 170 },
    { id: 'name', label: 'custom_discovery_name' },
    { id: 'type', label: 'custom_discovery_type', width: 110 },
    { id: 'source', label: 'custom_discovery_source', width: 130 },
    { id: 'detected', label: 'custom_discovery_detected' },
];

/**
 * Sort addresses the way somebody reading them expects: an IPv4 address by its four numbers
 * and not as text, so that .2 comes before .10, and a serial port after all of them.
 *
 * @param a first address
 * @param b second address
 */
export function compareAddresses(a: string, b: string): number {
    const aParts = /^\d+\.\d+\.\d+\.\d+$/.test(a) ? a.split('.').map(Number) : null;
    const bParts = /^\d+\.\d+\.\d+\.\d+$/.test(b) ? b.split('.').map(Number) : null;

    if (aParts && bParts) {
        for (let i = 0; i < 4; i++) {
            if (aParts[i] !== bParts[i]) {
                return aParts[i] - bParts[i];
            }
        }
        return 0;
    }
    // everything that is not an address - a serial port - goes behind
    if (aParts) {
        return -1;
    }
    if (bParts) {
        return 1;
    }
    return a > b ? 1 : a < b ? -1 : 0;
}

/** What a device shows in one column, and what the filter searches in */
function cellText(device: DiscoveryDevice, column: SortColumn): string {
    switch (column) {
        case 'address':
            return device._addr || '';
        case 'name':
            return device._name && device._name !== device._addr ? device._name : '';
        case 'type':
            return device._type || 'ip';
        case 'source':
            return device._source || '';
        case 'detected':
            return [...(device._detected || [])].sort().join(', ');
    }
}

interface DiscoveryDevicesComponentState extends ConfigGenericState {
    devices: DiscoveryDevice[];
    /**
     * The adapters installed on this host, by name, with their icon.
     *
     * A name that is not a key here is not installed - that is the interesting half of the
     * proposal, so those keep a plain outlined chip while the installed ones show their icon.
     */
    adapters: Record<string, string | null>;
    lastScan: number;
    running: boolean;
    filter: string;
    sortBy: SortColumn;
    sortDesc: boolean;
    loaded: boolean;
}

/**
 * The devices of the last scan, as a table.
 *
 * The data comes straight out of the `system.discovery` object - the same one the discovery
 * dialog of admin reads - and not through a `sendTo`: the object is subscribed, so a scan
 * started on the other tab fills the table in as soon as it has written its result, without
 * anything having to ask for it.
 */
export default class DiscoveryDevicesComponent extends ConfigGeneric<
    ConfigGenericProps,
    DiscoveryDevicesComponentState
> {
    constructor(props: ConfigGenericProps) {
        super(props);
        this.state = {
            ...this.state,
            devices: [],
            adapters: {},
            lastScan: 0,
            running: false,
            filter: '',
            sortBy: 'address',
            sortDesc: false,
            loaded: false,
        };
    }

    get runningId(): string {
        return `discovery.${this.props.oContext.instance}.scanRunning`;
    }

    async componentDidMount(): Promise<void> {
        void super.componentDidMount();

        const running = await this.props.oContext.socket.getState(this.runningId);
        const discovery = await this.readDiscovery();
        const adapters = await this.readAdapters();

        await this.props.oContext.socket.subscribeState(this.runningId, this.onRunningChanged);
        await this.props.oContext.socket.subscribeObject('system.discovery', this.onDiscoveryChanged);

        this.setState({ ...discovery, adapters, running: !!running?.val, loaded: true });
    }

    componentWillUnmount(): void {
        super.componentWillUnmount();
        void this.props.oContext.socket.unsubscribeState(this.runningId, this.onRunningChanged);
        void this.props.oContext.socket.unsubscribeObject('system.discovery', this.onDiscoveryChanged);
    }

    async readDiscovery(): Promise<{ devices: DiscoveryDevice[]; lastScan: number }> {
        try {
            const object = await this.props.oContext.socket.getObject('system.discovery');
            return DiscoveryDevicesComponent.fromObject(object);
        } catch (error) {
            console.error(`Cannot read system.discovery: ${error as string}`);
            return { devices: [], lastScan: 0 };
        }
    }

    /**
     * Which adapters are installed here, and what their icon is.
     *
     * `Utils.getObjectIcon` builds the path admin serves the icon under; an adapter without one
     * is remembered with `null`, because being installed is what the table shows.
     */
    async readAdapters(): Promise<Record<string, string | null>> {
        const adapters: Record<string, string | null> = {};
        try {
            for (const adapter of await this.props.oContext.socket.getAdapters()) {
                if (adapter?.common?.name) {
                    adapters[adapter.common.name] = Utils.getObjectIcon(adapter._id, adapter) || null;
                }
            }
        } catch (error) {
            console.error(`Cannot read the installed adapters: ${error as string}`);
        }
        return adapters;
    }

    /** Everything the table needs out of the `system.discovery` object */
    static fromObject(object: ioBroker.Object | null | undefined): {
        devices: DiscoveryDevice[];
        lastScan: number;
    } {
        const native = (object?.native || {}) as { devices?: DiscoveryDevice[]; lastScan?: number };
        const devices = Array.isArray(native.devices) ? native.devices : [];

        return {
            devices: devices.filter(device => device?._addr && device._addr !== NOT_A_DEVICE),
            lastScan: native.lastScan || 0,
        };
    }

    onRunningChanged = (_id: string, state: ioBroker.State | null | undefined): void => {
        const running = !!state?.val;
        if (running !== this.state.running) {
            this.setState({ running });
            if (!running) {
                // the scan just finished - it writes system.discovery before it clears this
                void this.readDiscovery().then(discovery => this.setState(discovery));
            }
        }
    };

    onDiscoveryChanged = (_id: string, object: ioBroker.Object | null | undefined): void => {
        this.setState(DiscoveryDevicesComponent.fromObject(object));
    };

    /** The rows to show: what is left of the filter, in the order of the chosen column */
    visibleDevices(): DiscoveryDevice[] {
        const filter = this.state.filter.trim().toLowerCase();
        const devices = filter
            ? this.state.devices.filter(device =>
                  COLUMNS.some(column => cellText(device, column.id).toLowerCase().includes(filter)),
              )
            : [...this.state.devices];

        const { sortBy, sortDesc } = this.state;
        devices.sort((a, b) => {
            const result =
                sortBy === 'address'
                    ? compareAddresses(a._addr, b._addr)
                    : cellText(a, sortBy).localeCompare(cellText(b, sortBy)) || compareAddresses(a._addr, b._addr);
            return sortDesc ? -result : result;
        });

        return devices;
    }

    renderHead(): React.JSX.Element {
        return (
            <TableHead>
                <TableRow sx={{ '& th': { backgroundColor: 'background.paper', fontWeight: 'bold' } }}>
                    {COLUMNS.map(column => (
                        <TableCell
                            key={column.id}
                            style={{ width: column.width }}
                            sortDirection={
                                this.state.sortBy === column.id ? (this.state.sortDesc ? 'desc' : 'asc') : false
                            }
                        >
                            <TableSortLabel
                                active={this.state.sortBy === column.id}
                                direction={this.state.sortBy === column.id && this.state.sortDesc ? 'desc' : 'asc'}
                                onClick={() =>
                                    this.setState({
                                        sortBy: column.id,
                                        sortDesc: this.state.sortBy === column.id ? !this.state.sortDesc : false,
                                    })
                                }
                            >
                                {I18n.t(column.label)}
                            </TableSortLabel>
                        </TableCell>
                    ))}
                </TableRow>
            </TableHead>
        );
    }

    renderRow(device: DiscoveryDevice): React.JSX.Element {
        const detected = [...(device._detected || [])].sort();

        return (
            <TableRow
                key={device._addr}
                hover
            >
                <TableCell style={{ whiteSpace: 'nowrap' }}>{device._addr}</TableCell>
                <TableCell>{cellText(device, 'name')}</TableCell>
                <TableCell>{cellText(device, 'type')}</TableCell>
                <TableCell>{cellText(device, 'source')}</TableCell>
                <TableCell>
                    {detected.length ? (
                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                            {detected.map(name => {
                                const installed = Object.prototype.hasOwnProperty.call(this.state.adapters, name);
                                const icon = installed ? this.state.adapters[name] : null;

                                return (
                                    <Chip
                                        key={name}
                                        label={name}
                                        size="small"
                                        variant={installed ? 'filled' : 'outlined'}
                                        title={I18n.t(
                                            installed ? 'custom_discovery_installed' : 'custom_discovery_not_installed',
                                        )}
                                        icon={
                                            icon ? (
                                                <Icon
                                                    src={icon}
                                                    alt={name}
                                                    style={{ width: 16, height: 16, marginLeft: 6 }}
                                                />
                                            ) : undefined
                                        }
                                    />
                                );
                            })}
                        </Box>
                    ) : null}
                </TableCell>
            </TableRow>
        );
    }

    renderItem(): React.JSX.Element {
        if (!this.state.loaded) {
            return <LinearProgress />;
        }

        const devices = this.visibleDevices();

        return (
            <Box sx={{ width: '100%' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 2, mb: 1 }}>
                    <Typography
                        variant="subtitle1"
                        sx={{ fontWeight: 'bold' }}
                    >
                        {I18n.t('custom_discovery_title')}
                    </Typography>
                    <Typography
                        variant="body2"
                        sx={{ color: 'text.secondary' }}
                    >
                        {this.state.lastScan
                            ? `${I18n.t('custom_discovery_last_scan')}: ${new Date(this.state.lastScan).toLocaleString()}`
                            : I18n.t('custom_discovery_never')}
                    </Typography>
                    <Box sx={{ flexGrow: 1 }} />
                    <TextField
                        variant="standard"
                        sx={{ width: 260 }}
                        label={I18n.t('custom_discovery_filter')}
                        value={this.state.filter}
                        onChange={e => this.setState({ filter: e.target.value })}
                        slotProps={{
                            input: {
                                startAdornment: (
                                    <InputAdornment position="start">
                                        <Search fontSize="small" />
                                    </InputAdornment>
                                ),
                                endAdornment: this.state.filter ? (
                                    <InputAdornment position="end">
                                        <IconButton
                                            size="small"
                                            onClick={() => this.setState({ filter: '' })}
                                        >
                                            <Close fontSize="small" />
                                        </IconButton>
                                    </InputAdornment>
                                ) : null,
                            },
                        }}
                    />
                </Box>

                {this.state.running ? (
                    <Box sx={{ mb: 1 }}>
                        <Typography
                            variant="body2"
                            sx={{ color: 'text.secondary' }}
                        >
                            {I18n.t('custom_discovery_running')}
                        </Typography>
                        <LinearProgress />
                    </Box>
                ) : null}

                {devices.length ? (
                    <TableContainer
                        component={Paper}
                        sx={{ width: '100%', maxHeight: 600 }}
                    >
                        <Table
                            size="small"
                            stickyHeader
                        >
                            {this.renderHead()}
                            <TableBody>{devices.map(device => this.renderRow(device))}</TableBody>
                        </Table>
                    </TableContainer>
                ) : (
                    <Typography
                        variant="body2"
                        sx={{ color: 'text.secondary', fontStyle: 'italic' }}
                    >
                        {this.state.devices.length
                            ? I18n.t('custom_discovery_no_match')
                            : I18n.t('custom_discovery_empty')}
                    </Typography>
                )}

                {devices.length ? (
                    <Typography
                        variant="body2"
                        sx={{ color: 'text.secondary', mt: 1 }}
                    >
                        {devices.length === this.state.devices.length
                            ? I18n.t('custom_discovery_count', devices.length)
                            : I18n.t('custom_discovery_count_filtered', devices.length, this.state.devices.length)}
                    </Typography>
                ) : null}
            </Box>
        );
    }
}
