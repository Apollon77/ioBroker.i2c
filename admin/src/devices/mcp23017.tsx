import SelectID from '@iobroker/adapter-react/Dialogs/SelectID';
import I18n from '@iobroker/adapter-react/i18n';
import Button from '@material-ui/core/Button';
import Checkbox from '@material-ui/core/Checkbox';
import FormControlLabel from '@material-ui/core/FormControlLabel';
import Grid from '@material-ui/core/Grid';
import InputAdornment from '@material-ui/core/InputAdornment';
import TextField from '@material-ui/core/TextField';
import withWidth from '@material-ui/core/withWidth';
import AddCircleOutlineIcon from '@material-ui/icons/AddCircleOutline';
import { boundMethod } from 'autobind-decorator';
import React from 'react';
import { MCP230xxConfig, PinConfig, PinDirection } from '../../../src/devices/mcp230xx-base';
import Dropdown, { DropdownOption } from '../components/dropdown';
import { DeviceBase, DeviceProps } from './device-base';
import { DeviceInfo } from './device-factory';

interface PinEditorProps {
    index: number;
    config: PinConfig;
    onChange: (index: number, config: PinConfig) => void;
}

class PinEditor extends React.Component<PinEditorProps, PinConfig> {
    private readonly dirOptions: DropdownOption[] = [
        { value: 'in-no', title: I18n.t('Input without internal pull-up resistor') },
        { value: 'in-pu', title: I18n.t('Input with internal pull-up resistor') },
        { value: 'out', title: I18n.t('Output') },
    ];

    constructor(props: PinEditorProps) {
        super(props);

        this.state = { ...props.config };
    }

    @boundMethod
    private onDirChange(value: string) {
        this.setState({ dir: value as PinDirection }, () => this.props.onChange(this.props.index, this.state));
    }

    @boundMethod
    private onInvChange(_event: React.ChangeEvent<HTMLInputElement>, checked: boolean) {
        this.setState({ inv: checked ? true : undefined }, () => this.props.onChange(this.props.index, this.state));
    }

    public render(): React.ReactNode {
        const { index } = this.props;
        return (
            <>
                <Grid item xs={2} md={2} lg={1} style={{ paddingTop: '23px' }}>
                    <strong>{`${I18n.t('Pin')} ${index < 8 ? 'A' : 'B'}${index % 8}`}</strong>
                </Grid>
                <Grid item xs={7} sm={6} md={4} lg={3} xl={2}>
                    <Dropdown
                        attr={`dir-${index}`}
                        options={this.dirOptions}
                        value={this.state.dir}
                        onChange={this.onDirChange}
                        style={{ paddingTop: '3px' }}
                    />
                </Grid>
                <Grid item xs={2} style={{ paddingTop: '11px' }}>
                    <FormControlLabel
                        control={<Checkbox checked={this.state.inv} onChange={this.onInvChange} name="inv" />}
                        label={I18n.t('inverted')}
                    />
                </Grid>
            </>
        );
    }
}

class MCP23017 extends DeviceBase<MCP230xxConfig, { showIdDialog: boolean }> {
    constructor(props: DeviceProps<MCP230xxConfig>) {
        super(props);

        let config: MCP230xxConfig;
        if (!props.config) {
            config = {
                pollingInterval: 200,
                pins: [],
            };

            for (let i = 0; i < 16; i++) {
                config.pins[i] = { dir: 'out' };
            }

            props.onChange(config);
        } else {
            config = { ...props.config };
        }
        config.interrupt = config.interrupt || '';
        console.log('new MCP23017()', props, config);
        this.state = { config: config, extra: { showIdDialog: false } };
    }

    @boundMethod
    protected selectInterruptId(): void {
        this.setExtraState({ showIdDialog: true });
    }

    @boundMethod
    protected onPinChange(index: number, config: PinConfig): void {
        const pins = [...this.state.config.pins];
        pins[index] = config;
        this.doHandleChange('pins', pins);
    }

    private onInterruptSelected(selected?: string) {
        this.setExtraState({ showIdDialog: false });
        if (selected) {
            this.doHandleChange('interrupt', selected);
        }
    }

    private renderPins() {
        const pins = this.state.config.pins;
        const width = this.props['width'];
        const isLarge = width === 'lg' || width === 'xl';
        if (isLarge) {
            const pinPairs = [] as PinConfig[][];
            for (let i = 0; i < 8; i++) {
                pinPairs[i] = [pins[i], pins[i + 8]];
            }

            return pinPairs.map((pinPair, i) => (
                <Grid key={`pin-ab${i}`} container spacing={3}>
                    <PinEditor index={i} config={pinPair[0]} onChange={this.onPinChange}></PinEditor>
                    <PinEditor index={i + 8} config={pinPair[1]} onChange={this.onPinChange}></PinEditor>
                </Grid>
            ));
        }
        return pins.map((pin, i) => (
            <Grid key={`pin-${i}`} container spacing={3}>
                <PinEditor index={i} config={pin} onChange={this.onPinChange}></PinEditor>
            </Grid>
        ));
    }

    public render(): React.ReactNode {
        return (
            <>
                {this.state.extra?.showIdDialog && (
                    <SelectID
                        socket={this.props.context.socket}
                        notEditable={false}
                        selected={this.state.config.interrupt}
                        onClose={() => this.onInterruptSelected()}
                        onOk={(selected) => this.onInterruptSelected(selected as string)}
                    ></SelectID>
                )}
                <Grid container spacing={3}>
                    <Grid item xs={7} sm={5} md={3}>
                        <TextField
                            name="pollingInterval"
                            label={I18n.t('Polling Interval')}
                            value={this.state.config.pollingInterval}
                            type="number"
                            InputProps={{
                                endAdornment: <InputAdornment position="end">ms</InputAdornment>,
                            }}
                            fullWidth
                            onChange={this.handleChange}
                        />
                    </Grid>
                </Grid>
                <Grid container spacing={3}>
                    <Grid item xs={9} md={6}>
                        <TextField
                            name="interrupt"
                            label={I18n.t('Interrupt object')}
                            value={this.state.config.interrupt}
                            type="text"
                            fullWidth
                            onChange={this.handleChange}
                        />
                    </Grid>
                    <Grid item xs={3} md={6}>
                        <Button variant="contained" onClick={this.selectInterruptId} style={{ marginTop: '22px' }}>
                            <AddCircleOutlineIcon />
                        </Button>
                    </Grid>
                </Grid>
                {this.renderPins()}
            </>
        );
    }
}

export const Info: DeviceInfo = {
    name: 'MCP23017',
    addresses: DeviceBase.getAllAddresses(0x20, 8),
    type: 'MCP23017',
    react: withWidth()(MCP23017) as any,
};
