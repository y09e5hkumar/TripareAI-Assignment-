import express, { NextFunction, Request, Response } from 'express';
import morgan from 'morgan';
import hotelsRouter from './routes/hotels';
import suppliersRouter from './routes/suppliers';
import healthRouter from './routes/health';

const app = express();

app.use(express.json());
app.use(morgan('dev'));

app.use('/api', hotelsRouter);
app.use('/', suppliersRouter);
app.use('/', healthRouter);

app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: 'Not found' });
});

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[unhandled error]', err);
  res.status(500).json({ error: 'Internal server error' });
});

export default app;
