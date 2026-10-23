import { config } from '../config';
import type { DataService } from './DataService';
import { DemoService } from './demo/DemoService';
import { SupabaseService } from './supabase/SupabaseService';

/** Supabase si hay credenciales públicas configuradas; si no, modo demostración. */
export const dataService: DataService = config.backendConfigured ? new SupabaseService() : new DemoService();
