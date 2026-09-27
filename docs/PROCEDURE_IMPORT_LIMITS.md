# Procedure import/export byte limits

Waypoint imports the existing `waypoint-procedure-1` format. Strict schema validation, known observation sources, checklist fields, assertion types and HTTPS-reference rules remain unchanged. Failed imports keep the pasted definition and current selection; only a successful import clears the dialog and selects its new record.

The former 100,000-byte import limit rejected valid exports the editor could produce. For example, 17 observation instructions with 2000 multilingual characters each yield a valid export over 105 KB, although it occupies fewer than 40,000 JavaScript characters. A separate 100,000-character textarea maximum could truncate exports containing many JSON-escaped characters.

## Derived bounds

| Boundary                                   | UTF-8 bytes | Reason                                                                     |
| ------------------------------------------ | ----------: | -------------------------------------------------------------------------- |
| Compact procedure body                     |     262,144 | Existing ordinary JSON request limit: 256 KiB.                             |
| Exact `POST /api/procedures/import`        |     262,185 | Same body plus the existing format/body envelope, exactly 41 bytes.        |
| Pasted text and textarea character ceiling |     288,123 | Import request plus at most 25,938 bytes of two-space exporter formatting. |

The global request limit remains 256 KiB. Only the exact POST import path receives the 41-byte envelope allowance. After semantic validation, both client and import route enforce the same compact-body limit. Existing authentication, CSRF, origin and native-privilege checks remain in place.

Procedure creation and revision also check the canonical body after authoring defaults have been applied, before writing a version. This covers duplication through the existing create path. A raw 262,144-byte body with 30 omitted checklist references expands to 262,594 bytes after validation; it must not silently create a new version outside the transferable body budget. Reads do not apply this new write limit or rewrite existing records. A pre-existing schema-valid record above the transfer budget remains readable, but must be reduced to fit before a new import or revision can be accepted.

Formatting overhead is derived from the schema's most nested and field-rich allowed shape: 30 checklist steps, 12 items per step and 8 tags. String content and escaping are already accounted for in the compact-body byte budget. The paste check rejects excessive text before JSON parsing, then checks the validated compact body before sending it. The browser sends compact JSON; arbitrary formatting overhead is not forwarded to the gateway. The textarea ceiling uses the byte bound as a conservative character ceiling, so supported UTF-8 exports are not truncated.

This permits the application's supported own exports, including Unicode and JSON-escaped text. It does not remove limits, accept additional formats or introduce a file-upload interface. A document with excessive extra whitespace may still exceed the bounded paste allowance.

## Verification — 2026-09-27

`tests/procedure-import-limits.test.ts` has five focused tests, including actual Express parser/route checks using a new temporary ProcedureStore and a controlled native-info response. An exact 262,144-byte procedure body is created, exported and reimported as a distinct record. Its 262,185-byte compact import succeeds; adding one byte fails with 413. Ordinary creation remains capped at 262,144 bytes, including a verified +1-byte rejection. Authentication and CSRF remain required. The tests also cover maximum structural formatting, Unicode, escaped strings, strict nested rejection, oversized text/body, authoring-default expansion, unchanged files after rejected creation/revision and preserved input/selection through the actual import callbacks. A synthetic legacy record above the new write budget remains readable and byte-identical.

Focused tests **5/5 passed**; full `npm run check` **220/220 tests and both builds passed**. Callback tests execute verbatim component callback source with controlled setters/transport; they do not claim DOM or browser-layout coverage. No existing data, live IRIS instance or procedure execution was used. Production browser integration is recorded separately.

Production-bundle browser integration passed at desktop 1280x900 and phone 375x844 (390px requested). The 105,277-byte Unicode export imported successfully; the 125,570-character escaped export was not truncated and imported successfully on phone. A separate synthetic 409 preserved all 37,277 pasted characters, the dialog and selected procedure; its error was visible above the field. Two accepted writes were confined to fixture memory, with zero native calls. Evidence in workspace research: waypoint-import-browser-state.json and waypoint-import-unicode-desktop.png, waypoint-import-escaped-phone.png, waypoint-import-rejected-phone.png.
