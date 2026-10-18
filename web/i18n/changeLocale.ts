export async function changeLocale(
  value: string,
  save: (locale: string) => Promise<{ ok: boolean }>,
  refresh: () => void,
): Promise<boolean> {
  try {
    const result = await save(value);
    if (!result.ok) return false;
    refresh();
    return true;
  } catch {
    return false;
  }
}
