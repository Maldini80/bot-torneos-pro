/**
 * Retorna un objeto con las partes de la fecha actual en la zona horaria de Madrid.
 */
export function getMadridTime() {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Europe/Madrid',
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
        hour: 'numeric',
        minute: 'numeric',
        second: 'numeric',
        hour12: false
    });
    const parts = formatter.formatToParts(now);
    const dateParts = {};
    for (const p of parts) {
        dateParts[p.type] = p.value;
    }
    const year = parseInt(dateParts.year, 10);
    const month = parseInt(dateParts.month, 10) - 1;
    const day = parseInt(dateParts.day, 10);
    const hour = parseInt(dateParts.hour, 10);
    const minute = parseInt(dateParts.minute, 10);
    const second = parseInt(dateParts.second, 10);
    
    const localMadrid = new Date(year, month, day, hour, minute, second);
    return {
        year: localMadrid.getFullYear(),
        month: localMadrid.getMonth(),
        date: localMadrid.getDate(),
        day: localMadrid.getDay(),
        hours: localMadrid.getHours(),
        minutes: localMadrid.getMinutes()
    };
}
