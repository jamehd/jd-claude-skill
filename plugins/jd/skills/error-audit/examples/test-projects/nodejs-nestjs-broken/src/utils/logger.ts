// Custom logger that wraps console.log
export const logger = {
  info: (msg: string, meta?: any) => console.log(JSON.stringify({ level: 'info', msg, ...meta })),
  error: (msg: string, meta?: any) => console.log(JSON.stringify({ level: 'error', msg, ...meta })),
};
// VIOLATION _common/02: error logged via console.log instead of console.error
