export class MonotonicTriggerGate {
  private lastAcceptedId = 0;

  accept(triggerId: number) {
    if (!Number.isFinite(triggerId) || triggerId <= this.lastAcceptedId)
      return false;
    this.lastAcceptedId = triggerId;
    return true;
  }
}
