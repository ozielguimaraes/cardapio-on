export function fmt(v) {
  return "R$ " + Number(v || 0).toFixed(2).replace(".", ",");
}

export function priceToStr(v) {
  return Number(v || 0).toFixed(2).replace(".", ",");
}

export function strToPrice(s) {
  const n = parseFloat(String(s).replace(",", ".").replace(/[^0-9.]/g, ""));
  return isNaN(n) ? 0 : n;
}
