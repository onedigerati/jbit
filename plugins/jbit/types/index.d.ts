/**
 * JBIT's hook keeps no session state (`PluginState`) and no store: each call reads the plan from disk, and the commit
 * secret guard judges each command on its own. So this contract declares nothing.
 */
