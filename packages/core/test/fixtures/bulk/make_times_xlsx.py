# The bulk tests' workbook of dates with a time (packages/core/test/table.test.ts, bulk.test.ts), written by openpyxl:
# python3 make_times_xlsx.py times.xlsx
import datetime, sys
from openpyxl import Workbook
wb = Workbook()
ws = wb.active
ws.title = "Times"
ws.append(["GTIN", "(7003) Expiry time", "(8008) Prod time", "(7011) Test by", "(17) Expiry"])
dt = datetime.datetime
ws.append(["09506000134376", dt(2027, 12, 31, 15, 30), dt(2026, 10, 1, 8, 5, 9), dt(2027, 6, 30, 10, 15), dt(2027, 12, 31, 15, 30)])
ws.append(["09506000134352", dt(2028, 1, 5, 0, 0), dt(2026, 10, 1, 23, 59, 59), dt(2027, 6, 30), dt(2028, 1, 5, 23, 59)])
formats = ["dd/mm/yyyy hh:mm", "yyyy-mm-dd hh:mm:ss", "dd/mm/yyyy", "m/d/yy h:mm"]  # the last is Excel's built-in 22
for col, fmt in enumerate(formats, start=2):
    for row in ws.iter_rows(min_row=2, min_col=col, max_col=col):
        for c in row: c.number_format = fmt
wb.save(sys.argv[1])
