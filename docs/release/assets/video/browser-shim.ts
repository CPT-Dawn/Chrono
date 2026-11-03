// What WXT gives Chrono's modules at run time, for the stage: browser.i18n from Chrono's
// English messages, and a storage that keeps nothing. Imported before anything else.
import messages from '../../../../public/_locales/en/messages.json';

type Messages = Record<string, { message: string; placeholders?: Record<string, { content: string }> }>;

/** browser.i18n.getMessage, as the browser does it, from Chrono's English messages. */
function getMessage(name: string, substitutions?: string | string[]): string {
  const entry = (messages as Messages)[name];
  if (!entry) return '';
  const subs = substitutions === undefined ? [] : Array.isArray(substitutions) ? substitutions : [substitutions];
  return entry.message.replace(/\$([A-Z_]+)\$/gi, (_, key: string) => {
    const content = entry.placeholders?.[key.toLowerCase()]?.content ?? '';
    return content.replace(/\$(\d)/g, (__, n: string) => subs[Number(n) - 1] ?? '');
  });
}
const g = globalThis as unknown as Record<string, unknown>;
g.browser = { i18n: { getMessage, getUILanguage: () => 'en-US' } };

g.storage = {
  defineItem: (_key: string, { fallback }: { fallback: unknown }) => ({
    getValue: async () => fallback,
    setValue: async () => {},
    watch: () => () => {},
  }),
};
