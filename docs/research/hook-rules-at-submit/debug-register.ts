import type { Register } from 'claude-code'
// throwaway spike: which hook route reaches the model in the turn whose prompt it first sees
const MODE = ['__MODE__']
const has = (m: string) => MODE.includes('all') || MODE.includes(m)
const trace: string[] = []
let seenPrompt = ''
const mark = ($: any, ev: string) => { trace.push(ev); $.ui.status(`DBG ${trace.join('>')}`) }
const word = (w: string) => `Spike instruction: include the code word ${w} in your reply.`
export const register: Register = on => {
  on('prompt.compose', async ($, e, next) => {
    const c = await next(e)
    mark($, `compose(prompt=${seenPrompt ? 'seen' : 'none'})`)
    if (has('compose') && seenPrompt) return { sections: [...c.sections, { id: 'dbg', text: word('COMPOSEWORD'), scope: 'session' as const }] }
    return c
  })
  on('prompt.context', async ($, e, next) => {
    const r = await next(e)
    mark($, `context(prompt=${seenPrompt ? 'seen' : 'none'})`)
    if (has('pctx') && seenPrompt) return { ...r, blocks: [...r.blocks, { ...r.blocks[0], text: word('PCTXWORD') } as any] }
    return r
  })
  on('turn.start', ($, e, next) => { mark($, 'turn.start'); return next(e) })
  on('prompt.submit', async ($, e, next) => {
    seenPrompt = e.text
    mark($, `submit(${e.origin.kind})`)
    if (has('inval')) { try { $.ui.invalidate('prompt.context'); $.ui.invalidate('prompt.section') } catch (err) { mark($, 'invalErr') } }
    let ev: any = e
    if (has('ctx')) ev = { ...ev, context: [...(ev.context ?? []), word('SUBMITCTXWORD')] }
    if (has('text')) ev = { ...ev, text: `${ev.text}\n\n${word('TEXTWORD')}` }
    return next(ev)
  })
}
