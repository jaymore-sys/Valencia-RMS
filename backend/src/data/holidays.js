const HOLIDAY_YEAR = 2026;

/*
2026 Holiday Leave Policy:
Employees can choose Holiday Leave
from the available festival holidays.
*/
const MAX_FESTIVAL_LEAVES = 4;

const HOLIDAYS = [
  /* =========================
     FIXED COMPANY HOLIDAYS
  ========================= */

  {
    date: "2026-01-26",
    name: "Republic Day",
    type: "fixed",
  },

  {
    date: "2026-05-01",
    name: "Maharashtra Day",
    type: "fixed",
  },

  {
    date: "2026-08-15",
    name: "Independence Day",
    type: "fixed",
  },

  {
    date: "2026-10-02",
    name: "Mahatma Gandhi Jayanti",
    type: "fixed",
  },

  /* =========================
     FESTIVAL HOLIDAY OPTIONS
  ========================= */

  {
    date: "2026-03-03",
    name: "Holi",
    type: "optional",
  },

  {
    date: "2026-03-19",
    name: "Gudhi Padwa",
    type: "optional",
  },

  {
    date: "2026-03-21",
    name: "Ramzan Eid",
    type: "optional",
  },

  {
    date: "2026-09-14",
    name: "Ganesh Chaturthi",
    type: "optional",
  },

  {
    date: "2026-11-08",
    name: "Diwali - Laxmi Pujan",
    type: "optional",
  },

  {
    date: "2026-12-25",
    name: "Christmas",
    type: "optional",
  },
];

const OPTIONAL_HOLIDAYS =
  HOLIDAYS.filter(
    (holiday) =>
      holiday.type ===
      "optional"
  );

const findOptionalHolidayByDate =
  (date) =>
    OPTIONAL_HOLIDAYS.find(
      (holiday) =>
        holiday.date === date
    ) || null;

/*
2027 onward annual allowance is 4.
Actual 2027 festival dates should be added
once the 2027 company holiday calendar is finalized.
*/
const getMaxFestivalLeavesForYear =
  (year) => {
    const numericYear =
      Number(year);

    if (
  numericYear === 2026
) {
  return 4;
}

    if (
      numericYear >= 2027
    ) {
      return 4;
    }

    return 0;
  };

module.exports = {
  HOLIDAY_YEAR,
  MAX_FESTIVAL_LEAVES,
  HOLIDAYS,
  OPTIONAL_HOLIDAYS,
  findOptionalHolidayByDate,
  getMaxFestivalLeavesForYear,
};