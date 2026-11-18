/**
 * Rails tables use bigint ids, which Prisma returns as BigInt. JSON.stringify cannot
 * serialize BigInt, so ids are sent as numbers (safe up to 2^53, far beyond our ids).
 */
export function enableBigIntJson(): void {
  const proto = BigInt.prototype as unknown as { toJSON?: () => number };
  if (!proto.toJSON) {
    proto.toJSON = function toJSON(this: bigint) {
      return Number(this);
    };
  }
}
