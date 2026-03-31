"""Backend i18n helpers."""



def get_localized(
    obj: dict | None, lang: str = "he", fallback: str = "he"
) -> str:
    """Extract localized text from a {he, en} dict."""
    if not obj:
        return ""
    if isinstance(obj, str):
        return obj
    return obj.get(lang, obj.get(fallback, ""))


def localize_error(he: str, en: str) -> dict[str, str]:
    """Create a bilingual error message."""
    return {"he": he, "en": en}
