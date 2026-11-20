// The host-neutral hook core: the Claude hook's handlers over a shim engine. A host adapter maps its events to
// `{ kind: 'prompt' | 'compose' | 'tool' | 'stop', ... }` and its answers back from `{ decision, reason, context, notices }`.
import { createEngine } from './engine.mjs'
import { dispatch, loadHandlers } from './dispatch.mjs'

export { createEngine, memoryEngine } from './engine.mjs'
export { call, dispatch, loadHandlers, NODE_TOO_OLD } from './dispatch.mjs'

let handlers

/** A core for one hook call: `projectDir` (real path), `dataDir` (the plugin's data folder), `sessionId`. */
export async function createCore(options) {
  handlers ??= await loadHandlers()
  const engine = await createEngine(options)
  return { engine, host: engine.host, run: event => dispatch(handlers, engine, event) }
}
