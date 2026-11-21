function wallParts(date:Date,timezone:string): number[] {
  const pieces = new Intl.DateTimeFormat("en-US",{timeZone:timezone,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(date);
  return ["year","month","day","hour","minute"].map(kind => Number(pieces.find(part => part.type === kind)?.value));
}
export function resolveWallTime(parts:number[],timezone:string): Date {
  const guess = Date.UTC(parts[0],parts[1]-1,parts[2],parts[3],parts[4]);
  const matches:Date[] = [];
  for (let offset = -14*60;offset <= 14*60;offset += 15) {
    const date = new Date(guess + offset*60_000);
    if (wallParts(date,timezone).every((value,index) => value === parts[index])) matches.push(date);
  }
  if (matches.length !== 1) throw new Error(matches.length ? "This wall-clock time occurs twice during a daylight saving change. Choose an unambiguous time." : "This wall-clock time does not exist during a daylight saving change. Choose another time.");
  return matches[0];
}
export function resolveDeskSchedule(preset:string,custom:string,timezone:string,now:Date = new Date()): Date | null {
  if (preset === "now") return null;
  if (preset === "hour") return new Date(now.getTime()+3_600_000);
  const local = wallParts(now,timezone);
  let desired:number[];
  if (preset === "custom") {
    const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(custom);
    if (!match) throw new Error("Enter a local date and time.");
    desired = match.slice(1).map(Number);
  } else {
    const tomorrow = preset === "tomorrow" || (preset === "tonight" && local[3] >= 20);
    const civil = new Date(Date.UTC(local[0],local[1]-1,local[2]+(tomorrow ? 1 : 0)));
    desired = [civil.getUTCFullYear(),civil.getUTCMonth()+1,civil.getUTCDate(),preset === "tonight" ? 20 : 9,0];
  }
  const date = resolveWallTime(desired,timezone);
  if (date.getTime() <= now.getTime()) throw new Error("Choose a future time.");
  return date;
}
export function describeSchedule(date:Date | null,timezone:string): string {
  return date ? new Intl.DateTimeFormat("en-US",{timeZone:timezone,weekday:"short",year:"numeric",month:"short",day:"numeric",hour:"numeric",minute:"2-digit",timeZoneName:"short"}).format(date)+` · ${timezone}` : "Queue now · starts when the Command Desk worker is free";
}
