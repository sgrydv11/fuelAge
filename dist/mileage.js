export const ordered = logs => [...logs].sort((a,b) => a.date.localeCompare(b.date) || a.odo - b.odo);
export function summarize(logs) {
  const rows = ordered(logs);
  let baseline, fuel = 0, cost = 0, complete = true;
  const intervals = [];
  for (const row of rows) {
    if (baseline) {
      fuel += row.qty;
      cost += row.cost ?? 0;
      complete &&= row.cost != null;
    }
    if (!row.full) continue;
    if (baseline && row.odo > baseline.odo) {
      const distance = row.odo - baseline.odo;
      intervals.push({id:row.id,date:row.date,distance,fuel,mileage:distance/fuel,cost:complete ? cost : null});
    }
    baseline = row;
    fuel = 0;
    cost = 0;
    complete = true;
  }
  const totals = intervals.reduce((sum, leg) => ({
    distance:sum.distance+leg.distance, fuel:sum.fuel+leg.fuel,
    cost:sum.cost+(leg.cost ?? 0), paidDistance:sum.paidDistance+(leg.cost == null ? 0 : leg.distance)
  }), {distance:0,fuel:0,cost:0,paidDistance:0});
  return {
    rows, intervals, average:totals.distance/totals.fuel, latest:intervals.at(-1)?.mileage,
    distance:rows.length ? rows.at(-1).odo-rows[0].odo : undefined,
    running:totals.cost/totals.paidDistance
  };
}
export const quantityUnit = v => ({CNG:'kg',Electric:'kWh'})[v.fuel] ?? v.volume;
export const mileageUnit = v => v.distance === 'mi' && quantityUnit(v) === 'gal' ? 'MPG' : v.distance+'/'+quantityUnit(v);
export function changeUnits(log,v,next) {
  const distance = v.distance === next.distance ? 1 : next.distance === 'mi' ? 1/1.609344 : 1.609344;
  const oldUnit = quantityUnit(v), newUnit = quantityUnit(next);
  const volume = oldUnit === newUnit ? 1 : newUnit === 'gal' ? 1/3.785411784 : 3.785411784;
  const odometer = log.odo*distance, quantity = log.qty*volume;
  return {...log,odo:Number(odometer.toPrecision(12)),qty:Number(quantity.toPrecision(12))};
}
