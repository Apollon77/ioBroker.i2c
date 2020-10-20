import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { MuiThemeProvider } from '@material-ui/core/styles';
import theme from '@iobroker/adapter-react/Theme';
import Utils from '@iobroker/adapter-react/Components/Utils';
import App from './app';

window['adapterName'] = 'i2c';
let themeName = Utils.getThemeName();

function build(): void {
    ReactDOM.render(
        <MuiThemeProvider theme={theme(themeName)}>
            <App
                onThemeChange={(_theme) => {
                    themeName = _theme;
                    build();
                }}
            />
        </MuiThemeProvider>,
        document.getElementById('root'),
    );
}

build();
