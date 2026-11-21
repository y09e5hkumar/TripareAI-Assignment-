import { Router, Request, Response } from 'express';
import { supplierAHotels } from '../data/supplierA';
import { supplierBHotels } from '../data/supplierB';

const router = Router();

/**
 * Mock supplier endpoints. Pass ?fail=true to simulate that supplier being down
 * (returns 503), useful for exercising the Postman "supplier down" scenario.
 */
router.get('/supplierA/hotels', (req: Request, res: Response) => {
  if (req.query.fail === 'true' || process.env.SUPPLIER_A_DOWN === 'true') {
    return res.status(503).json({ error: 'Supplier A is currently unavailable' });
  }
  const city = String(req.query.city || '').toLowerCase();
  return res.json(supplierAHotels.filter((h) => h.city === city));
});

router.get('/supplierB/hotels', (req: Request, res: Response) => {
  if (req.query.fail === 'true' || process.env.SUPPLIER_B_DOWN === 'true') {
    return res.status(503).json({ error: 'Supplier B is currently unavailable' });
  }
  const city = String(req.query.city || '').toLowerCase();
  return res.json(supplierBHotels.filter((h) => h.city === city));
});

export default router;
