import { Router } from 'express';
import axios from 'axios';
import redis from '../redisClient';

const router = Router();

async function checkSupplier(baseUrl: string, path: string) {
  const start = Date.now();
  try {
    await axios.get(`${baseUrl}${path}`, { params: { city: 'delhi' }, timeout: 3000 });
    return { status: 'up', latencyMs: Date.now() - start };
  } catch (err) {
    return {
      status: 'down',
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

router.get('/health', async (_req, res) => {
  const baseUrl = process.env.API_BASE_URL || `http://localhost:${process.env.PORT || 3000}`;

  const [supplierA, supplierB] = await Promise.all([
    checkSupplier(baseUrl, '/supplierA/hotels'),
    checkSupplier(baseUrl, '/supplierB/hotels'),
  ]);

  let redisStatus: 'up' | 'down' = 'down';
  try {
    await redis.ping();
    redisStatus = 'up';
  } catch {
    redisStatus = 'down';
  }

  const overall =
    supplierA.status === 'up' && supplierB.status === 'up' && redisStatus === 'up'
      ? 'healthy'
      : 'degraded';

  res.json({
    status: overall,
    suppliers: { supplierA, supplierB },
    redis: redisStatus,
    timestamp: new Date().toISOString(),
  });
});

export default router;
