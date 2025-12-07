import { Request, Response } from 'express';
import { Example } from '../models/Example';
import { AppError, ErrorCode } from '../utils/AppError';

export class ExampleController {
  /**
   * @swagger
   * /api/examples:
   *   get:
   *     summary: Get all examples
   *     tags: [Examples]
   *     responses:
   *       200:
   *         description: List of examples
   */
  static async getAll(req: Request, res: Response): Promise<void> {
    const examples = await Example.find({ isActive: true });
    res.json({
      success: true,
      data: examples,
    });
  }

  /**
   * @swagger
   * /api/examples/{id}:
   *   get:
   *     summary: Get example by ID
   *     tags: [Examples]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: Example found
   *       404:
   *         description: Example not found
   */
  static async getById(req: Request, res: Response): Promise<void> {
    const { id } = req.params;
    const example = await Example.findById(id);

    if (!example) {
      throw new AppError('Example not found', 404, ErrorCode.NOT_FOUND);
    }

    res.json({
      success: true,
      data: example,
    });
  }

  /**
   * @swagger
   * /api/examples:
   *   post:
   *     summary: Create new example
   *     tags: [Examples]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - name
   *             properties:
   *               name:
   *                 type: string
   *               description:
   *                 type: string
   *     responses:
   *       201:
   *         description: Example created
   */
  static async create(req: Request, res: Response): Promise<void> {
    const example = await Example.create(req.body);
    res.status(201).json({
      success: true,
      data: example,
    });
  }

  /**
   * @swagger
   * /api/examples/{id}:
   *   put:
   *     summary: Update example
   *     tags: [Examples]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: Example updated
   *       404:
   *         description: Example not found
   */
  static async update(req: Request, res: Response): Promise<void> {
    const { id } = req.params;
    const example = await Example.findByIdAndUpdate(id, req.body, {
      new: true,
      runValidators: true,
    });

    if (!example) {
      throw new AppError('Example not found', 404, ErrorCode.NOT_FOUND);
    }

    res.json({
      success: true,
      data: example,
    });
  }

  /**
   * @swagger
   * /api/examples/{id}:
   *   delete:
   *     summary: Delete example
   *     tags: [Examples]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: Example deleted
   *       404:
   *         description: Example not found
   */
  static async delete(req: Request, res: Response): Promise<void> {
    const { id } = req.params;
    const example = await Example.findByIdAndDelete(id);

    if (!example) {
      throw new AppError('Example not found', 404, ErrorCode.NOT_FOUND);
    }

    res.json({
      success: true,
      message: 'Example deleted successfully',
    });
  }
}


