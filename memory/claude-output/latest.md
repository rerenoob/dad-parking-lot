# Revenue Report Modal — UI/UX Audit & Fixes
Date: 2026-07-03

## Fixes Applied

### CRITICAL — Date bugs
1. **parseDateNoTz helper** added at line ~519: parses `YYYY-MM-DD` using `new Date(y, m-1, d)` to avoid UTC midnight shift in local timezones.
2. **formatDateStr helper** added at line ~527: formats `YYYY-MM-DD` → `DD/MM/YYYY` without constructing a Date object.
3. **renderRangeReportBody date parsing** changed from `new Date(startRaw + 'T00:00:00')` to `parseDateNoTz(startRaw)`.
4. **Payment range filter** changed from `pd >= startDate && pd <= endDate` to string comparison `pdKey >= startRaw && pdKey <= endRaw` — fully timezone-safe.
5. **daysDiff** now uses `parseDateNoTz` on fresh local dates + `Math.round` instead of `Math.ceil` to prevent off-by-one at DST boundaries.
6. **Summary date display** uses `formatDateStr(startRaw)` and `formatDateStr(endRaw)` — no longer touches `new Date()`.

### HIGH — Layout bugs
7. **"Xem báo cáo" button** moved to its own full-width row below the two date inputs.
8. **Expandable chevron** `▶` added to daily rows; rotates 90° via CSS transform on expand/collapse. Uses unique `dayRow_N` / `dayDetail_N` IDs.
9. **Left border accent** on expanded detail div: `border-left: 3px solid #1a73e8` with `background: #f6f8ff`.
10. **Summary white-space** fixed with `white-space: nowrap` on label spans so labels don't wrap.
11. **Tab differentiation**: inactive tab uses `background: #e8eaed` instead of transparent; active tab gets `box-shadow: 0 1px 3px rgba(0,0,0,0.2)`.

### MEDIUM — Currency & UX
12. **formatCurrency** updated globally to `amount + ' ₫'` (space before ₫) for cleaner rendering.
13. **Empty state** for zero transactions shows icon + centered message, returned early before building rows.
14. **"Chi tiết theo ngày (bấm vào ngày để xem)"** hint text simplified to "Chi tiết theo ngày" since chevrons now communicate expandability.
