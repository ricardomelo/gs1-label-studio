// Sharing (backlog 7.1 l; the check studio's project, section 7.4; ADR 0007 decision 18): the device's own share sheet
// first, from the tap (navigator.canShare then navigator.share, with the file when the sheet takes it); else a menu of
// WhatsApp (wa.me, text only), e-mail (mailto:, text only: the file is downloaded and the message says to attach it),
// Copy the text, Copy the link and Download. The text alone is enough to act on; a link carries the data in the address's
// fragment ("#/check?r=…", "#/label?w=…"), never seen by the web server, and is left out past 2,000 characters.

import { LINK_LIMIT } from "@gs1-label-studio/core";
import { download } from "./download.ts";
import { t } from "./i18n.ts";

/** What a share sends: a title (the e-mail's subject), the text, a link when the data fits in one, a file. */
export interface ShareContent {
  title: string;
  text: string;
  link: string | null;
  file: File | null;
  /** True when a link would have been longer than LINK_LIMIT: the menu says why there is none. */
  linkTooLong?: boolean;
}

/** The published tool's address before its fragment. */
export function siteAddress(): string {
  const { origin, pathname } = window.location;
  return `${origin}${pathname}`;
}

/** A studio's link with what it carries ("check", "r", data), or null when it would be longer than LINK_LIMIT. */
export function studioLink(studio: "check" | "label" | "barcode", key: "r" | "w", param: string): string | null {
  const link = `${siteAddress()}#/${studio}?${key}=${param}`;
  return link.length <= LINK_LIMIT ? link : null;
}

/** The text with its link under it, as a message carries it. */
export function messageText(content: Pick<ShareContent, "text" | "link">): string {
  return content.link ? `${content.text}\n\n${content.link}` : content.text;
}

/** WhatsApp's click to chat: the text, URL-encoded; the person picks the contact. */
export function whatsappAddress(content: Pick<ShareContent, "text" | "link">): string {
  return `https://wa.me/?text=${encodeURIComponent(messageText(content))}`;
}

/** An e-mail to write: the title as its subject, the text as its body, and a line saying to attach the file saved. */
export function mailAddress(content: Pick<ShareContent, "title" | "text" | "link" | "file">): string {
  const body = content.file ? `${messageText(content)}\n\n${t("Attach the file just saved: {name}", { name: content.file.name })}` : messageText(content);
  return `mailto:?subject=${encodeURIComponent(content.title)}&body=${encodeURIComponent(body)}`;
}

/**
 * The device's share sheet, when it has one that takes what is shared: true when it was offered (shared or cancelled by
 * the person), false when the menu must be offered instead.
 */
export async function shareSheet(content: ShareContent): Promise<boolean> {
  const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean };
  if (typeof nav.share !== "function") return false;
  const files = content.file ? [content.file] : [];
  const data: ShareData = { title: content.title, text: messageText(content) };
  if (files.length) {
    // A sheet that does not take this kind of file still shares the text; the menu then offers the file too
    if (!nav.canShare?.({ files })) return false;
    data.files = files;
  }
  try {
    await nav.share(data);
    return true;
  } catch (error) {
    return error instanceof DOMException && error.name === "AbortError";
  }
}

/** The file saved, as Download does. */
export async function saveFile(file: File): Promise<void> {
  download(file.name, new Uint8Array(await file.arrayBuffer()), file.type);
}

/** Whether a share or export that includes personal data was allowed during this visit: it asks once (section 7.1). */
let personalAllowed = false;
export const personalAsked = () => personalAllowed;
export const allowPersonal = () => {
  personalAllowed = true;
};

/** A label's or a barcode's text (the generators): each data title and value, the element string, the Digital Link URI. */
export function workShareText(heading: string, elements: readonly { ai: string; title: string; value: string }[], elementString: string, uri: string): string {
  const lines = [heading, ...elements.map((e) => `${e.title} (${e.ai}): ${e.value}`)];
  if (elementString) lines.push("", `${t("Element string")}: ${elementString}`);
  if (uri) lines.push(`${t("GS1 Digital Link URI")}: ${uri}`);
  lines.push("", t("Made with GS1 Label Studio."));
  return lines.join("\n");
}
