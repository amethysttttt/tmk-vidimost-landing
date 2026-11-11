# -*- coding: utf-8 -*-
from datetime import date, timedelta

_FIXED = {
    (1, 1), (1, 2), (1, 7), (3, 8), (3, 21), (3, 22), (3, 23),
    (5, 1), (5, 7), (5, 9), (7, 6), (8, 30), (10, 25), (12, 16),
}
_EXTRA = {
    date(2025, 1, 3), date(2025, 3, 24), date(2025, 5, 8), date(2025, 7, 7), date(2025, 12, 15),
    date(2026, 1, 5), date(2026, 3, 24), date(2026, 5, 8), date(2026, 7, 7), date(2026, 12, 15),
    date(2027, 1, 4), date(2027, 3, 24), date(2027, 5, 10), date(2027, 7, 7),
}


def is_business_day(d: date) -> bool:
    if d.weekday() >= 5:
        return False
    return (d.month, d.day) not in _FIXED and d not in _EXTRA


def add_business_days(start: date, days: int) -> date:
    cur, left = start, days
    while left > 0:
        cur += timedelta(days=1)
        if is_business_day(cur):
            left -= 1
    return cur
