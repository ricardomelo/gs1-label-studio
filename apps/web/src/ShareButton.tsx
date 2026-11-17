import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { t } from "./i18n.ts";
import { allowPersonal, mailAddress, messageText, personalAsked, saveFile, shareSheet, whatsappAddress, type ShareContent } from "./share.ts";

// One Share button wherever there is something to send (backlog 7.1 l; ADR 0007 decision 18, mock-up A): the tap
// offers the device's share sheet; a device without one, or whose sheet does not take the file, gets a menu of
// WhatsApp, E-mail, Copy the text, Copy the link and Download, as the split buttons' menus look (a sheet from the bottom
// on a phone). What is shared is prepared as the pointer comes near, so that the sheet opens within the tap's time. A
// share that includes a serial number or a person's number asks once a visit, as the exports do.

interface Props {
  /** Builds what is shared: the text, the link (null when none fits) and the file. */
  prepare: () => Promise<ShareContent>;
  /** It carries a serial number or a person's number. */
  personal?: boolean;
  disabled?: boolean;
  /** The button's text; "Share" by default. */
  text?: string;
}

export function ShareButton({ prepare, personal = false, disabled, text }: Props) {
  const [open, setOpen] = useState(false);
  const [asking, setAsking] = useState(false);
  const [content, setContent] = useState<ShareContent | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const pending = useRef<Promise<ShareContent> | null>(null);
  const box = useRef<HTMLSpanElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const id = useId();
  // What is shared changes with the screen: prepared afresh at the next approach
  const prepareRef = useRef(prepare);
  if (prepareRef.current !== prepare) {
    prepareRef.current = prepare;
    pending.current = null;
  }
  const ready = () => (pending.current ??= prepareRef.current());

  const close = (focus: boolean) => {
    setOpen(false);
    setAsking(false);
    if (focus) button.current?.focus();
  };
  useEffect(() => {
    if (!open && !asking) return;
    menu.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const outside = (event: PointerEvent) => {
      if (!box.current?.contains(event.target as Node)) close(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open, asking]);

  const go = async () => {
    const shared = await ready();
    setContent(shared);
    if (await shareSheet(shared)) return;
    setOpen(true);
  };
  const press = () => {
    if (open || asking) return close(true);
    if (personal && !personalAsked()) return setAsking(true);
    void go();
  };
  const said = (what: string) => {
    setDone(what);
    setTimeout(() => setDone(null), 2000);
  };
  const copy = (value: string, what: string) => void navigator.clipboard?.writeText(value).then(() => said(what), () => undefined);

  const onMenuKey = (event: KeyboardEvent<HTMLDivElement>) => {
    const all = [...(menu.current?.querySelectorAll<HTMLButtonElement>("button") ?? [])];
    const at = all.indexOf(document.activeElement as HTMLButtonElement);
    const by = event.key === "ArrowDown" ? 1 : event.key === "ArrowUp" ? -1 : 0;
    if (by) {
      event.preventDefault();
      all[(at + by + all.length) % all.length]?.focus();
    } else if (event.key === "Escape") {
      event.preventDefault();
      close(true);
    } else if (event.key === "Tab") close(false);
  };

  return (
    <span className="split share" ref={box}>
      <button
        type="button"
        ref={button}
        className="btn share-button"
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onPointerEnter={() => void ready()}
        onFocus={() => void ready()}
        onPointerDown={() => void ready()}
        onClick={press}
      >
        <span aria-hidden="true">↗ </span>
        {text ?? t("Share…")}
      </button>
      {asking && (
        <div className="split-menu share-ask" role="alertdialog" aria-label={t("Personal data")} ref={menu} onKeyDown={onMenuKey}>
          <p>{t("This includes a serial number or a person's number. Share it anyway?")}</p>
          <div className="check-row">
            <button
              type="button"
              className="btn primary"
              onClick={() => {
                allowPersonal();
                setAsking(false);
                void go();
              }}
            >
              {t("Yes, share")}
            </button>
            <button type="button" className="btn" onClick={() => close(true)}>
              {t("Cancel")}
            </button>
          </div>
        </div>
      )}
      {open && content && (
        <div className="split-menu share-menu" role="menu" id={id} aria-label={t("Share…")} ref={menu} onKeyDown={onMenuKey}>
          <div className="split-heading" aria-hidden="true">
            {t("Send it by")}
          </div>
          <button type="button" role="menuitem" tabIndex={-1} onClick={() => { window.open(whatsappAddress(content), "_blank", "noopener"); close(true); }}>
            <span className="split-text">WhatsApp</span>
            <span className="split-detail">{t("the text and the link; the file is sent from the phone")}</span>
          </button>
          <button
            type="button"
            role="menuitem"
            tabIndex={-1}
            onClick={() => {
              if (content.file) void saveFile(content.file);
              window.location.href = mailAddress(content);
              close(true);
            }}
          >
            <span className="split-text">{t("E-mail")}</span>
            <span className="split-detail">{content.file ? t("the file is saved first: attach it to the message") : t("the text and the link")}</span>
          </button>
          <button type="button" role="menuitem" tabIndex={-1} onClick={() => { copy(messageText(content), t("Text copied")); close(true); }}>
            <span className="split-text">{t("Copy the text")}</span>
          </button>
          {content.link && (
            <button type="button" role="menuitem" tabIndex={-1} onClick={() => { copy(content.link!, t("Link copied")); close(true); }}>
              <span className="split-text">{t("Copy the link")}</span>
              <span className="split-detail">{t("whoever opens it sees the same; the data travels in the link")}</span>
            </button>
          )}
          {content.file && (
            <button type="button" role="menuitem" tabIndex={-1} onClick={() => { void saveFile(content.file!); close(true); }}>
              <span className="split-text">{t("Download {name}", { name: content.file.name })}</span>
            </button>
          )}
          {content.linkTooLong && <p className="split-detail share-note">{t("No link: the data is too long for one; the file carries it.")}</p>}
        </div>
      )}
      {done && (
        <span className="hint share-done" role="status">
          {done}
        </span>
      )}
    </span>
  );
}
