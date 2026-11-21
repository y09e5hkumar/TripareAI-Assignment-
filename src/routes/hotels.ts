import { Router, Request, Response } from 'express';
import { getTemporalClient } from '../temporalClient';
import redis from '../redisClient';
import type { getHotelsWorkflow, HotelOffer } from '../workflows/hotelWorkflow';
import { TASK_QUEUE, HOTELS_CACHE_TTL_SECONDS } from '../shared/constants';

const router = Router();

function priceSetKey(city: string) {
  return `hotels:${city}:byPrice`;
}

function hotelHashKey(city: string, name: string) {
  return `hotels:${city}:hotel:${name}`;
}

async function cacheHotels(city: string, hotels: HotelOffer[]) {
  const setKey = priceSetKey(city);
  const pipeline = redis.pipeline();
  pipeline.del(setKey);

  for (const hotel of hotels) {
    pipeline.zadd(setKey, hotel.price, hotel.name);
    pipeline.set(hotelHashKey(city, hotel.name), JSON.stringify(hotel), 'EX', HOTELS_CACHE_TTL_SECONDS);
  }
  pipeline.expire(setKey, HOTELS_CACHE_TTL_SECONDS);

  await pipeline.exec();
}

async function runAggregationWorkflow(city: string): Promise<HotelOffer[]> {
  const client = await getTemporalClient();
  const handle = await client.workflow.start<typeof getHotelsWorkflow>('getHotelsWorkflow', {
    taskQueue: TASK_QUEUE,
    workflowId: `get-hotels-${city}-${Date.now()}`,
    args: [city],
  });
  return handle.result();
}

router.get('/hotels', async (req: Request, res: Response) => {
  try {
    const city = String(req.query.city || '').trim().toLowerCase();
    if (!city) {
      return res.status(400).json({ error: 'city query parameter is required' });
    }

    const hasMin = req.query.minPrice !== undefined;
    const hasMax = req.query.maxPrice !== undefined;
    const minPrice = hasMin ? Number(req.query.minPrice) : undefined;
    const maxPrice = hasMax ? Number(req.query.maxPrice) : undefined;

    if ((hasMin && Number.isNaN(minPrice)) || (hasMax && Number.isNaN(maxPrice))) {
      return res.status(400).json({ error: 'minPrice and maxPrice must be valid numbers' });
    }

    const wantsFilter = hasMin || hasMax;
    const setKey = priceSetKey(city);

    // If a filter is requested and we already have this city cached in Redis,
    // do the range filtering entirely inside Redis via ZRANGEBYSCORE.
    if (wantsFilter && (await redis.exists(setKey))) {
      const names = await redis.zrangebyscore(setKey, minPrice ?? '-inf', maxPrice ?? '+inf');
      if (names.length === 0) {
        return res.json([]);
      }
      const raw = await redis.mget(...names.map((name) => hotelHashKey(city, name)));
      const hotels = raw.filter((item): item is string => Boolean(item)).map((item) => JSON.parse(item));
      return res.json(hotels);
    }

    // Cold path: no cache entry yet (or no filter applied) -> run the Temporal
    // workflow to fetch + dedupe + select the cheapest offer per hotel, then
    // persist the result into Redis for subsequent filtered reads.
    const result = await runAggregationWorkflow(city);
    await cacheHotels(city, result);

    if (!wantsFilter) {
      return res.json(result);
    }

    const filtered = result.filter(
      (hotel) =>
        (minPrice === undefined || hotel.price >= minPrice) &&
        (maxPrice === undefined || hotel.price <= maxPrice)
    );
    return res.json(filtered);
  } catch (err) {
    console.error('[GET /api/hotels] error', err);
    return res.status(500).json({
      error: 'Internal server error',
      details: err instanceof Error ? err.message : String(err),
    });
  }
});

export default router;
