import axios from 'axios';
import { log } from '@temporalio/activity';
import { SupplierHotel } from '../data/types';

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';

async function fetchSupplier(path: string, city: string): Promise<SupplierHotel[]> {
  const { data } = await axios.get<SupplierHotel[]>(`${API_BASE_URL}${path}`, {
    params: { city },
    timeout: 5000,
  });
  return data;
}

export async function fetchSupplierAHotels(city: string): Promise<SupplierHotel[]> {
  try {
    return await fetchSupplier('/supplierA/hotels', city);
  } catch (err) {
    log.error('Supplier A fetch failed, continuing with empty result', {
      error: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
}

export async function fetchSupplierBHotels(city: string): Promise<SupplierHotel[]> {
  try {
    return await fetchSupplier('/supplierB/hotels', city);
  } catch (err) {
    log.error('Supplier B fetch failed, continuing with empty result', {
      error: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
}
