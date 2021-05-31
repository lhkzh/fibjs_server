"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.dateTimeStr = void 0;
function dateTimeStr() { var t = new Date, e = t.getFullYear(), n = t.getMonth() + 1, r = t.getDate(); return e + "-" + (n < 10 ? "0" + n : n) + "-" + (r < 10 ? "0" + r : r) + " " + t.toTimeString().substr(0, 8); }
exports.dateTimeStr = dateTimeStr;
