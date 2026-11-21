import { proxyActivities, log } from '@temporalio/workflow';
import type * as activities from '../activities/supplierActivities';

const { fetchSupplierAHotels, fetchSupplierBHotels } = proxyActivities<typeof activities>({
  startToCloseTimeout: '10 seconds',
  retry: {
    initialInterval: '1 second',
    backoffCoefficient: 2,
    maximumAttempts: 3,
  },
});

export interface HotelOffer {
  name: string;
  price: number;
  supplier: string;
  commissionPct: number;
}

export async function getHotelsWorkflow(city: string): Promise<HotelOffer[]> {
  log.info('Starting hotel aggregation workflow', { city });

  const [hotelsA, hotelsB] = await Promise.all([
    fetchSupplierAHotels(city),
    fetchSupplierBHotels(city),
  ]);

  const merged = new Map<string, HotelOffer>();

  for (const hotel of hotelsA) {
    merged.set(hotel.name, {
      name: hotel.name,
      price: hotel.price,
      supplier: 'Supplier A',
      commissionPct: hotel.commissionPct,
    });
  }

  for (const hotel of hotelsB) {
    const existing = merged.get(hotel.name);
    if (!existing || hotel.price < existing.price) {
      merged.set(hotel.name, {
        name: hotel.name,
        price: hotel.price,
        supplier: 'Supplier B',
        commissionPct: hotel.commissionPct,
      });
    }
  }

  const result = Array.from(merged.values()).sort((a, b) => a.price - b.price);

  log.info('Completed hotel aggregation workflow', {
    city,
    supplierACount: hotelsA.length,
    supplierBCount: hotelsB.length,
    dedupedCount: result.length,
  });

  return result;
}
