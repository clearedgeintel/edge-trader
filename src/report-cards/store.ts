import type { ReportCard } from './types.js';

export class ReportCardStore {
  private readonly cards: ReportCard[] = [];
  private readonly maxCards = 200;

  add(card: ReportCard): void {
    this.cards.push(card);
    if (this.cards.length > this.maxCards) {
      this.cards.splice(0, this.cards.length - this.maxCards);
    }
  }

  /** Replace cards (e.g. rehydrating from persistence), keeping the newest. */
  hydrate(cards: ReportCard[]): void {
    this.cards.splice(0, this.cards.length, ...cards.slice(-this.maxCards));
  }

  getAll(limit = 50): ReportCard[] {
    return this.cards.slice(-limit).reverse();
  }

  getBySymbol(symbol: string, limit = 20): ReportCard[] {
    return this.cards
      .filter((c) => c.symbol === symbol)
      .slice(-limit)
      .reverse();
  }
}