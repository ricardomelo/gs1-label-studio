import { en } from "./i18n.ts";

// The Check Studio's simple view (backlog 7.1 f; the check studio's project, section 6.1; ADR 0007 decision 8): each
// fault of the catalogue (packages/core/src/data/check_faults.json, whose texts stay the expert's, in English) told
// in plain words, in three sentences — what is wrong, why it matters, how to fix it and who does it — shown through
// t() in the user's language. Where it is, the fourth line, is the code's own text with the part highlighted.
// Writing rules (section 6.1): one sentence each; an AI named by its title, never by its number alone; the fixer
// named ("whoever makes the label"); the scanner never blamed; no "invalid" without saying what.

export interface SimpleTexts {
  what: string;
  why: string;
  fix: string;
}

const s = (what: string, why: string, fix: string): SimpleTexts => ({ what, why, fix });

export const SIMPLE_TEXTS: Readonly<Record<string, SimpleTexts>> = {
  A1: s(
    en("This is an ordinary Data Matrix, not a GS1 DataMatrix."),
    en("A till or hospital scanner will not recognise it as a product code."),
    en("Whoever makes the label should choose \"GS1 DataMatrix\" in the label software, not type a code in front of the data."),
  ),
  A2: s(
    en("This is an ordinary QR Code carrying GS1 data, not a GS1 QR Code."),
    en("Scanners will read it as plain text, not as a product code."),
    en("Whoever makes the label should choose \"GS1 QR Code\", or put a GS1 Digital Link web address in the ordinary QR Code instead."),
  ),
  A3: s(
    en("This is an ordinary Code 128, not a GS1-128."),
    en("Warehouse and till systems will not read the data as GS1 data."),
    en("Whoever makes the label should choose \"GS1-128\" in the label software or the printer command."),
  ),
  A4: s(
    en("The mark that says \"this is GS1 data\" was typed as letters into the data."),
    en("Those letters become part of the product code and spoil it."),
    en("Whoever makes the label should remove the typed letters and switch the software's GS1 mode on."),
  ),
  A5: s(
    en("The data starts with a separator where the GS1 start mark should be."),
    en("Scanners will not recognise the data as GS1 data."),
    en("Whoever makes the label should choose the GS1 version of the symbol rather than add a character at the start."),
  ),
  A6: s(
    en("A web address was put into a GS1 symbol, which is meant for data with AIs."),
    en("Scanners expect product data in this symbol and will not understand the address."),
    en("Whoever makes the label should put the web address in an ordinary QR Code or Data Matrix, or encode the data with AIs instead."),
  ),
  A7: s(
    en("This ITF symbol is not a 14-digit ITF-14."),
    en("Only 14 digits make it a GS1 carton code; anything else is not read as one."),
    en("Whoever makes the label should encode the 14-digit GTIN, adding a leading zero to a 13-digit one."),
  ),
  A8: s(
    en("This is not a GS1 code."),
    en("It may be a company's own code or a plain link: nothing a GS1 system will look up."),
    en("Nothing to fix, unless a GS1 code was intended: then make it in the Barcode Studio."),
  ),
  A9: s(
    en("This type of symbol cannot be read here."),
    en("The reader in this page has no decoder for it, so nothing can be said about its data."),
    en("Read it with a scanner connected as a keyboard and paste what it gives."),
  ),
  B1: s(
    en("The brackets around the AIs were encoded in the symbol."),
    en("Brackets are only for people to read; scanners pass them on as data and systems refuse it."),
    en("Whoever makes the label should give the software the data without brackets, or use its GS1 input that removes them."),
  ),
  B2: s(
    en("Spaces, line breaks or printed words such as EXP or LOT were encoded."),
    en("Only the AIs and their values belong in the symbol; the extra characters spoil the data."),
    en("Whoever makes the label should encode the data alone and print the words beside the symbol."),
  ),
  B3: s(
    en("A separator is missing after a value whose length varies."),
    en("Without it, a system cannot tell where this value ends and the next AI begins."),
    en("Whoever makes the label should put a separator after that value, or move it to the end of the data."),
  ),
  B4: s(
    en("There is a separator after a value of fixed length, where none is needed."),
    en("It takes room in the symbol and some systems split the data wrongly because of it."),
    en("Whoever makes the label should remove it."),
  ),
  B5: s(
    en("The data ends with a separator."),
    en("Nothing follows it, so it only takes room and may confuse some systems."),
    en("Whoever makes the label should remove it."),
  ),
  B6: s(
    en("A character stands in for the separator, which only the GS1 mode of the software can encode."),
    en("Systems read the stand-in as part of the value."),
    en("Whoever makes the label should let the software insert the separator rather than type a character for it."),
  ),
  B7: s(
    en("The data contains an AI that does not exist."),
    en("Systems cannot read it, and it is often a sign that the value before it has the wrong length."),
    en("Whoever prepares the data should check that AI and the value just before it."),
  ),
  B8: s(
    en("A value has the wrong length for its AI."),
    en("Each of these AIs has a fixed number of characters; any other number is refused."),
    en("Whoever prepares the data should correct the value: a GTIN, for example, is padded to 14 digits with zeros in front."),
  ),
  B9: s(
    en("A value contains a character that is not allowed."),
    en("Numbers may only hold digits, and other values only plain letters, digits and a few signs: accents and most symbols are refused."),
    en("Whoever prepares the data should replace that character."),
  ),
  B10: s(
    en("The same AI appears twice with different values."),
    en("A system cannot know which of the two values is right."),
    en("Whoever prepares the data should keep only the right one."),
  ),
  B11: s(
    en("Values of fixed length come after values whose length varies."),
    en("It costs a separator and room in the symbol, though it is allowed."),
    en("Whoever prepares the data can put the GTIN and the dates first next time."),
  ),
  B12: s(
    en("There is more data than a GS1-128 can hold."),
    en("A GS1-128 holds at most 48 characters of data; the rest cannot be encoded."),
    en("Whoever makes the label should split the data into two GS1-128 symbols or use a 2D symbol."),
  ),
  C1: s(
    en("The last digit of the number, its check digit, is wrong."),
    en("Systems refuse the number, and a wrong check digit usually means another digit was mistyped."),
    en("Whoever prepares the data should check the whole number against the one assigned to the item."),
  ),
  C2: s(
    en("The two check characters at the end of the model number are wrong."),
    en("Systems refuse the model number."),
    en("Whoever prepares the data should work out the check characters again from the model number."),
  ),
  C3: s(
    en("The GTIN starts with 9, for an item sold by measure, but no measure is given."),
    en("Without its weight or quantity the item cannot be priced or counted."),
    en("Whoever prepares the data should add the measure, or use the item's ordinary GTIN."),
  ),
  C4: s(
    en("This GTIN is a case's or a pack's, not a single item's sold at a till."),
    en("A GTIN starting with 1 to 8 identifies a grouping, which a shop till does not sell."),
    en("Whoever prepares the data should check that the case's GTIN was not put on the item itself."),
  ),
  C5: s(
    en("The GTIN does not have the 14 digits its AI requires."),
    en("Systems refuse a GTIN of any other length under this AI."),
    en("Whoever prepares the data should add or remove the zeros in front so that it has 14 digits."),
  ),
  C6: s(
    en("The number uses a prefix for use inside one company or country only."),
    en("It will not be recognised in open trade."),
    en("Whoever assigns the number should use a GTIN from the company's licensed GS1 prefix for products sold to others."),
  ),
  C7: s(
    en("This is an example number, for demonstrations only."),
    en("It does not belong to any real product."),
    en("Whoever prepares the data should replace it with the item's own number before printing."),
  ),
  C8: s(
    en("The company prefix of this number was not found among GS1's licensed prefixes."),
    en("The number may not be licensed, so others may not recognise it."),
    en("Check the number with the local GS1 office."),
  ),
  C9: s(
    en("The code has details such as a batch or a date, but no product number."),
    en("A batch or a date means nothing without the GTIN or other key it belongs to."),
    en("Whoever prepares the data should add the key, in the same symbol where possible."),
  ),
  D1: s(
    en("A date cannot exist."),
    en("Systems refuse the date, and the item may be blocked."),
    en("Whoever prepares the data should correct the date, written as year, month and day (YYMMDD)."),
  ),
  D2: s(
    en("A date has day 00, which stands for the last day of its month."),
    en("This is allowed; the date it stands for is shown beside it."),
    en("Nothing to fix."),
  ),
  D3: s(
    en("A healthcare product's date has day 00."),
    en("Since 1 January 2025 regulated healthcare products must give the real day."),
    en("Whoever prepares the data should encode the actual last day of the month."),
  ),
  D4: s(
    en("A date seems to be written day first, not year first."),
    en("Read as GS1 dates are read, year, month and day, it gives another date or none."),
    en("Whoever prepares the data should write it as year, month and day (YYMMDD)."),
  ),
  D5: s(
    en("A date is possible but unlikely: long past, far in the future, or before another date."),
    en("It may be a typing mistake that a system will not catch."),
    en("Whoever prepares the data should check it against the source."),
  ),
  D6: s(
    en("A batch or serial number is too long or has characters that are not allowed."),
    en("Systems refuse it; it takes up to 20 plain letters, digits and a few signs."),
    en("Whoever assigns these numbers should agree a format that keeps to those characters."),
  ),
  D7: s(
    en("A batch or serial number mixes characters that are easily confused, such as O and 0 or I and 1."),
    en("It is allowed, but people typing it by hand often get it wrong."),
    en("Whoever assigns these numbers can prefer letters and digits that cannot be mistaken."),
  ),
  D8: s(
    en("A measure is zero or looks implausible."),
    en("It may be a mistake in the data or in the decimal point."),
    en("Whoever prepares the data should check the measure, shown here with its unit."),
  ),
  D9: s(
    en("A value does not follow its AI's rules."),
    en("Systems refuse it."),
    en("Whoever prepares the data should correct it as the message beside it says."),
  ),
  E1: s(
    en("An AI is missing that must go with another."),
    en("Some details only make sense together, such as a batch with its GTIN."),
    en("Whoever prepares the data should add it, unless another code on the same item carries it."),
  ),
  E2: s(
    en("Two AIs appear together that must not."),
    en("Together they contradict each other, and systems refuse the data."),
    en("Whoever prepares the data should keep only one of them."),
  ),
  E3: s(
    en("A serial number is missing where this kind of number requires one."),
    en("Without it the individual item cannot be identified."),
    en("Whoever prepares the data should add the serial number."),
  ),
  F1: s(
    en("This type of symbol is not one used where the code will be scanned."),
    en("Scanners there may not be set up to read it."),
    en("Whoever makes the label should use one of the symbols listed below, the first being the recommended one."),
  ),
  F2: s(
    en("An EAN or UPC symbol only holds the GTIN: no batch, date or serial."),
    en("The details expected cannot be in this symbol."),
    en("Whoever makes the label should add a 2D symbol or a GS1 DataBar Expanded for them."),
  ),
  F3: s(
    en("A 2D symbol alone, without its ordinary barcode, for a shop till."),
    en("Many tills still read only the ordinary barcode, so the item may not scan."),
    en("Whoever makes the label should keep the EAN/UPC or GS1 DataBar beside the 2D symbol; if it is there, add it to this check."),
  ),
  F4: s(
    en("The barcode has a small extra symbol, an add-on."),
    en("Add-ons are used on magazines and books; many tills ignore them."),
    en("Nothing to fix."),
  ),
  F5: s(
    en("Where the code will be scanned was not given."),
    en("Whether this type of symbol suits its place cannot be judged."),
    en("Choose where it is scanned above to have it checked."),
  ),
  G1: s(
    en("This web address carries no GS1 product number."),
    en("It is an ordinary link: a till or a GS1 system cannot identify anything with it."),
    en("Nothing to fix if no GS1 code was intended; otherwise build a GS1 Digital Link address with the GTIN in it."),
  ),
  G2: s(
    en("The parts of the web address are in the wrong order, or do not belong to its key."),
    en("Systems may not find the product from this address."),
    en("Whoever makes the code should use the address in the right order, shown below."),
  ),
  G3: s(
    en("A detail is in the wrong part of the web address."),
    en("Dates, weights and the like go after the ?, while batch and serial go in the path; systems may not read them otherwise."),
    en("Whoever makes the code should move it, as the address shown below does."),
  ),
  G4: s(
    en("The web address names an AI that does not exist."),
    en("Systems cannot read that part of the address."),
    en("Whoever makes the code should correct the AI or give the parameter a name that is not a number."),
  ),
  G5: s(
    en("The web address carries an AI that such addresses may not carry."),
    en("Systems will ignore or refuse it."),
    en("Whoever makes the code should remove it."),
  ),
  G6: s(
    en("A character in the web address was not written in its coded form, such as a / in a batch number."),
    en("The address is cut short at that character and the value is lost."),
    en("Whoever makes the code should use the address shown below, with the character coded."),
  ),
  G7: s(
    en("The web address is valid but not in GS1's standard form."),
    en("It works; the standard form, shown below, says what it means."),
    en("Nothing to fix."),
  ),
  G8: s(
    en("The web address starts with http:// rather than https://."),
    en("Phones and browsers increasingly refuse addresses that are not secure."),
    en("Whoever makes the code should use https://."),
  ),
  G9: s(
    en("The web address uses a name such as /gtin/ where the AI's number belongs."),
    en("Those names are no longer in the standard and many systems refuse them."),
    en("Whoever makes the code should use the AI's number, as in /01/."),
  ),
  G10: s(
    en("The web address is in compressed form."),
    en("It is valid, but few scanners can read it."),
    en("Whoever makes the code can prefer the uncompressed form."),
  ),
  G11: s(
    en("A value inside the web address breaks the rules for its AI."),
    en("The address is another way of writing the same data, so the same rules apply."),
    en("Whoever makes the code should correct the value as the message beside it says."),
  ),
  H1: s(
    en("The symbol is too small or too large for where it is scanned."),
    en("Scanners there may fail to read it."),
    en("Whoever makes the label should make it again at the size recommended for that place."),
  ),
  H2: s(
    en("The clear margin around the symbol is too narrow."),
    en("Scanners need that margin to find the symbol."),
    en("Whoever makes the label should keep text and graphics away from the symbol."),
  ),
  H3: s(
    en("The bars have been cut short."),
    en("A short barcode can only be read in one direction, which slows the till."),
    en("Whoever makes the label should restore the bars' full height."),
  ),
  H4: s(
    en("The symbol is light on dark, or mirrored."),
    en("Many scanners cannot read it that way."),
    en("Whoever makes the label should print it dark on light and the right way round."),
  ),
  H5: s(
    en("The text printed under the symbol does not match its data."),
    en("People reading the text will get a different number from the scanner."),
    en("Whoever makes the label should correct the printed text."),
  ),
  I1: s(
    en("The tag does not hold a GS1 EPC."),
    en("It may be another system's tag, or an empty one."),
    en("Check that the tag was written with a GS1 scheme."),
  ),
  I2: s(
    en("The EPC's fields do not agree with each other."),
    en("Systems may decode a different number, or none."),
    en("Whoever writes the tags should encode it again, as the RFID Studio will."),
  ),
  I3: s(
    en("The NFC tag's web address is not where phones expect it: first, as a web address record, starting with https."),
    en("A phone may not open it, or open something else."),
    en("Whoever writes the tags should write it again with the address first, starting with https."),
  ),
  I4: s(
    en("The NFC tag's web address breaks a rule for such addresses."),
    en("The problems of the address itself are listed with it."),
    en("Whoever writes the tags should write the corrected address."),
  ),
  J1: s(
    en("The codes on this item carry different GTINs or other keys."),
    en("Scanners will identify the same item as different products."),
    en("Whoever makes the label should correct the odd one out; if they are different pack sizes, check them separately."),
  ),
  J2: s(
    en("The codes on this item give different values for the same detail, such as batch or expiry."),
    en("Systems cannot know which value is right."),
    en("Whoever makes the label should print every code from one source of data."),
  ),
  J3: s(
    en("The details are in one symbol and their GTIN only in another."),
    en("A system reading only one symbol cannot relate the details to the product."),
    en("Whoever makes the label should put the GTIN and its details in one symbol."),
  ),
  J4: s(
    en("A shop item has a 2D symbol but no ordinary barcode."),
    en("Many tills still read only the ordinary barcode."),
    en("Whoever makes the label should add an EAN/UPC or GS1 DataBar."),
  ),
  J5: s(
    en("The 2D symbol is far from the ordinary barcode."),
    en("A till may not relate the two."),
    en("Whoever makes the label should place the 2D symbol within 50 mm of the barcode."),
  ),
  J6: s(
    en("The 2D symbol lacks data that the GS1-128 beside it has."),
    en("A scanner reading only the 2D symbol misses that data."),
    en("Whoever makes the label should add that data to the 2D symbol."),
  ),
  J7: s(
    en("The RFID tag and the barcode disagree."),
    en("The tag and the barcode will be read as different items."),
    en("Whoever writes the tags should encode the barcode's GTIN and serial number exactly, character for character."),
  ),
  J8: s(
    en("The NFC tag and the 2D symbol disagree."),
    en("A phone tapping the tag and one scanning the symbol will reach different things."),
    en("Whoever writes the tags should write the symbol's web address to the tag."),
  ),
  J9: s(
    en("The logistic label contradicts itself."),
    en("A pallet or carton has one SSCC, and its details must agree across the label's barcodes."),
    en("Whoever makes the label should correct it; the Label Studio's GS1 Logistic Label makes it consistently."),
  ),
  J10: s(
    en("There is a code on the pack that is not a GS1 code."),
    en("A scanner may read it instead of the product's barcode."),
    en("Whoever designs the pack should hide or move it."),
  ),
};
