import request from 'supertest';
import app from '../../app';

describe('API Versioning', () => {
  describe('V1 API', () => {
    it('должен работать через /api/v1/health', async () => {
      const response = await request(app).get('/api/v1/health').expect(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('message', 'OK');
    });

    it('должен работать через /api/health (обратная совместимость)', async () => {
      const response = await request(app).get('/api/health').expect(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('message', 'OK');
    });
  });

  describe('Root endpoint', () => {
    it('должен возвращать информацию о версии API', async () => {
      const response = await request(app).get('/').expect(200);
      expect(response.body.success).toBe(true);
      expect(response.body).toHaveProperty('version');
      expect(response.body).toHaveProperty('documentation');
    });
  });

  describe('404 handling', () => {
    it('должен возвращать 404 для несуществующего маршрута', async () => {
      const response = await request(app).get('/api/v1/nonexistent').expect(404);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('NOT_FOUND');
    });
  });
});



