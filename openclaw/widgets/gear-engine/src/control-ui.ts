import {ActivityModel} from './activity.ts';
import {GearView} from './gear-view.ts';
import type {Host, ViewContext} from './host.ts';

export default {
  id: 'openclaw-gear-engine',
  activate(host: Host) {
    if (host.apiVersion !== 1) throw new Error('Gear Engine requires Control UI API v1.');
    return host.ui.registerAccessory({id: 'activity-gears', placement: 'session-header', mount});
  },
};

function mount(container: HTMLElement, initial: ViewContext) {
  let context = initial, disposed = false, generation = 0;
  const host = context.host;
  const model = new ActivityModel(key => host.sessions.normalizeKey(key));
  const wrapper = document.createElement('div');
  wrapper.style.cssText = 'display:flex;flex-direction:column;align-items:flex-end;box-sizing:border-box;width:100%;padding:0 12px 4px;';
  const scope = document.createElement('select');
  scope.setAttribute('aria-label', 'Gear activity scope');
  scope.style.cssText = 'max-width:100%;font:inherit;font-size:11px;color:inherit;background:transparent;border:1px solid currentColor;border-radius:6px;';
  for (const [value, label] of [['all','All visible work'],['chat','This chat']]) {
    const option = document.createElement('option'); option.value = value; option.textContent = label;
    scope.append(option);
  }
  const view = new GearView();
  wrapper.append(scope, view); container.append(wrapper);
  let renderTimer: ReturnType<typeof setTimeout> | undefined;
  let receiptTimer: ReturnType<typeof setTimeout> | undefined;
  let observation: ReturnType<Host['sessions']['observe']> | undefined;
  const paint = () => {
    renderTimer = undefined;
    if (disposed) return;
    const activity = model.view(performance.now(), scope.value === 'chat' ? context.props : undefined);
    view.activity = {...activity, rows: activity.rows.map(row => ({...row, label: host.redact(row.label)}))};
    view.presented = context.presented;
    wrapper.hidden = !context.presented;
  };
  const schedule = () => { if (!disposed && renderTimer === undefined) renderTimer = setTimeout(paint, 100); };
  const synchronize = () => {
    const connected = host.connection.connected && host.connection.canRead;
    if (connected !== model.connected) {
      generation++; observation?.dispose(); observation = undefined;
      model.clear(); model.connected = connected;
      clearTimeout(receiptTimer);
      if (connected) {
        const ownGeneration = generation;
        observation = host.sessions.observe({limit:200, includeGlobal:true, includeUnknown:true,
          includeDerivedTitles:false, includeLastMessage:false}, snapshot => {
          if (disposed || ownGeneration !== generation) return;
          if (snapshot.error) { model.error = true; }
          else if (snapshot.result) model.snapshot(snapshot.result.sessions, snapshot.result.hasMore === true);
          schedule();
        });
      }
    }
    schedule();
  };
  const stops = ['session.message','chat','agent'].map(name => host.onEvent(name, payload => {
    if (!disposed && model.event(name, payload, performance.now())) {
      schedule(); clearTimeout(receiptTimer);
      receiptTimer = setTimeout(schedule, 185);
    }
  }));
  stops.push(host.subscribe(synchronize));
  scope.addEventListener('change', paint);
  const dispose = () => {
    if (disposed) return;
    disposed = true; generation++; observation?.dispose();
    stops.forEach(stop => stop()); clearTimeout(renderTimer); clearTimeout(receiptTimer);
    scope.removeEventListener('change', paint); initial.signal.removeEventListener('abort', dispose);
    model.clear(); wrapper.remove();
  };
  initial.signal.addEventListener('abort', dispose, {once:true});
  synchronize(); paint();
  return {update(next: ViewContext) {context = next; paint();}, dispose};
}
