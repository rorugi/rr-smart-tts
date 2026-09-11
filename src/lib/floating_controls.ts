import { QueueEvent, type ReactRNPlugin } from '@remnote/plugin-sdk';

// Serialize host RPCs: leaving review while an open is pending must close it.
export function attachFloatingControls(plugin: ReactRNPlugin): () => Promise<void> {
  let wanted = false;
  let disposed = false;
  let eventReceived = false;
  let widgetId: string | undefined;
  let pending = Promise.resolve();
  const reconcile = () => {
    pending = pending.then(async () => {
      if (wanted && !disposed) {
        if (widgetId && !(await plugin.window.isFloatingWidgetOpen(widgetId))) widgetId = undefined;
        if (!widgetId) {
          widgetId = await plugin.window.openFloatingWidget(
            'smart_tts', { right: 16, bottom: 96 }, undefined, false
          );
        }
      }
      if ((!wanted || disposed) && widgetId) {
        await plugin.window.closeFloatingWidget(widgetId);
        widgetId = undefined;
      }
    }).catch(async () => {
      await plugin.app.toast('RR Smart TTS: Could not update floating controls.').catch(() => {});
    });
    return pending;
  };
  const enter = () => { eventReceived = true; wanted = true; void reconcile(); };
  const leave = () => { eventReceived = true; wanted = false; void reconcile(); };
  plugin.event.addListener(QueueEvent.QueueEnter, undefined, enter);
  plugin.event.addListener(QueueEvent.QueueLoadCard, undefined, enter);
  plugin.event.addListener(QueueEvent.QueueExit, undefined, leave);
  // Also attach when the plugin is reloaded with a review already open.
  void plugin.queue.getCurrentCard().then((card) => {
    if (card && !disposed && !eventReceived) enter();
  }).catch(() => {});
  return async () => {
    disposed = true;
    wanted = false;
    plugin.event.removeListener(QueueEvent.QueueEnter, undefined, enter);
    plugin.event.removeListener(QueueEvent.QueueLoadCard, undefined, enter);
    plugin.event.removeListener(QueueEvent.QueueExit, undefined, leave);
    await reconcile();
  };
}
