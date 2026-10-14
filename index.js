// -----------------------------------------------------------------------------
// Entry point: SDK wiring only. Every handler is registered BEFORE connect(),
// and delegates to the AutomowerApp (src/app.js).
//
// Environment variables provided by the Gladys supervisor, read by the SDK:
// GLADYS_HOST_API_URL, GLADYS_INTEGRATION_TOKEN, GLADYS_INTEGRATION_SELECTOR,
// and TZ (the time zone of Gladys, the one the mower timestamps are read in).
// -----------------------------------------------------------------------------

import { GladysIntegration, logger } from '@gladysassistant/integration-sdk';
import { AutomowerApp } from './src/app.js';
import { ACTIONS, SCENE_ACTIONS, WIDGETS } from './src/constants.js';

const gladys = new GladysIntegration();
const app = new AutomowerApp({ gladys });

// --- Discovery and commands ------------------------------------------------------
gladys.onScanRequest(() => app.scan());
gladys.onDeviceCreated(() => app.deviceCreated());
gladys.onDeviceUpdated(() => app.deviceCreated());
gladys.onSetValue((device, feature, value) => app.setValue(device, feature, value));

// --- Scene actions --------------------------------------------------------------
gladys.onSceneAction(SCENE_ACTIONS.START, (fields) => app.startMowing(fields));
gladys.onSceneAction(SCENE_ACTIONS.PARK, (fields) => app.park(fields));
gladys.onSceneAction(SCENE_ACTIONS.PAUSE, (fields) => app.pause(fields));
gladys.onSceneAction(SCENE_ACTIONS.RESUME, (fields) => app.resumeSchedule(fields));

// --- Dashboard widget ----------------------------------------------------------
gladys.onWidgetGet(WIDGETS.MOWER, (request) => app.getWidget(request));
gladys.onWidgetAction(WIDGETS.MOWER, (actionKey, params) => app.widgetAction(actionKey, params));

// --- Configuration screen button ----------------------------------------------
gladys.onAction(ACTIONS.TEST, () => app.testConnection());

// --- Configuration changed by the user ----------------------------------------
// A save may follow a fix on the Developer Portal: a refused key is retried.
gladys.onConfigUpdated((config) => {
  logger.info('Configuration updated: restarting');
  return app.start(config, { resume: true });
});

// --- Connection lifecycle ------------------------------------------------------
gladys.on('connected', async () => {
  try {
    await app.start(await gladys.getConfig());
  } catch (err) {
    logger.error('Start failed', err);
  }
});
gladys.on('disconnected', () => app.stop());
gladys.handleShutdown(() => app.shutdown());

logger.info('Starting the Husqvarna Automower integration...');
gladys.connect().catch((err) => {
  logger.error('Initial connection failed', err);
  process.exit(1);
});
