import type { Request, Response } from "express";
import { Router } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import { protect, authorize } from "../../middleware/auth";
import { requireActiveAccount } from "../../middleware/requireActiveAccount";
import { validateBody } from "../../middleware/validate";
import { HttpError } from "../../utils/httpError";
import { Order } from "../orders/order.model";
import { Delivery, type DeliveryStage } from "./delivery.model";
import {
  assertDeliveryParticipant,
  advanceDeliveryStage,
  assignRiderToDelivery,
  getDeliveryBundleForOrder,
  listRiderAssignments,
  listAvailableRiders,
  patchDeliveryDropoff,
  postRiderLocation,
  setEstimatedArrival,
  serializeDelivery,
  resendDeliveryOtp
} from "./delivery.service";
import {
  patchDeliveryStageSchema,
  assignRiderSchema,
  riderLocationSchema,
  dropoffSchema,
  etaSchema
} from "./delivery.schemas";

const router = Router();

router.get(
  "/riders/available",
  protect,
  requireActiveAccount,
  authorize("seller", "admin"),
  asyncHandler(async (_req: Request, res: Response) => {
    const riders = await listAvailableRiders();
    res.json({ riders });
  })
);

router.get(
  "/rider/assignments",
  protect,
  requireActiveAccount,
  authorize("rider"),
  asyncHandler(async (req: Request, res: Response) => {
    const list = await listRiderAssignments(req.user!.id);
    res.json({ assignments: list });
  })
);

router.get(
  "/order/:orderId",
  protect,
  requireActiveAccount,
  asyncHandler(async (req: Request, res: Response) => {
    const { orderId } = req.params;
    const order = await Order.findById(orderId);
    if (!order) throw new HttpError(404, "Order not found");
    const d = await Delivery.findOne({ orderId: order._id });
    await assertDeliveryParticipant(req.user!.id, req.user!.role, order, d);
    const bundle = await getDeliveryBundleForOrder(orderId);
    res.json(bundle);
  })
);

router.patch(
  "/order/:orderId/stage",
  protect,
  requireActiveAccount,
  validateBody(patchDeliveryStageSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { orderId } = req.params;
    const body = req.body as {
      stage: DeliveryStage;
      deliveryOtp?: string;
      receivedByName?: string;
      deliveryNote?: string;
    };
    const { stage } = body;
    const d = await advanceDeliveryStage({
      orderId,
      nextStage: stage,
      actorId: req.user!.id,
      actorRole: req.user!.role,
      proof: {
        deliveryOtp: body.deliveryOtp,
        receivedByName: body.receivedByName,
        deliveryNote: body.deliveryNote
      }
    });
    const order = await Order.findById(orderId);
    res.json({ delivery: serializeDelivery(d), orderStatus: order?.status });
  })
);

router.post(
  "/order/:orderId/resend-delivery-otp",
  protect,
  requireActiveAccount,
  authorize("rider", "admin"),
  asyncHandler(async (req: Request, res: Response) => {
    const { orderId } = req.params;
    const result = await resendDeliveryOtp({
      orderId,
      actorId: req.user!.id,
      actorRole: req.user!.role
    });
    res.json(result);
  })
);

router.post(
  "/order/:orderId/assign-rider",
  protect,
  requireActiveAccount,
  validateBody(assignRiderSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { orderId } = req.params;
    const { riderUserId } = req.body as { riderUserId: string };
    const d = await assignRiderToDelivery({
      orderId,
      riderUserId,
      actorId: req.user!.id,
      actorRole: req.user!.role
    });
    res.json({ delivery: serializeDelivery(d) });
  })
);

router.patch(
  "/order/:orderId/dropoff",
  protect,
  requireActiveAccount,
  validateBody(dropoffSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { orderId } = req.params;
    const body = req.body as { latitude?: number; longitude?: number; label?: string };
    const d = await patchDeliveryDropoff({
      orderId,
      actorId: req.user!.id,
      actorRole: req.user!.role,
      ...body
    });
    res.json({ delivery: serializeDelivery(d) });
  })
);

router.patch(
  "/order/:orderId/eta",
  protect,
  requireActiveAccount,
  validateBody(etaSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { orderId } = req.params;
    const { estimatedArrivalMinutes } = req.body as { estimatedArrivalMinutes: number };
    const d = await setEstimatedArrival({
      orderId,
      actorId: req.user!.id,
      actorRole: req.user!.role,
      minutes: estimatedArrivalMinutes
    });
    res.json({ delivery: serializeDelivery(d) });
  })
);

router.post(
  "/order/:orderId/rider-location",
  protect,
  requireActiveAccount,
  authorize("rider"),
  validateBody(riderLocationSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { orderId } = req.params;
    const { latitude, longitude } = req.body as { latitude: number; longitude: number };
    const d = await postRiderLocation({
      orderId,
      riderUserId: req.user!.id,
      latitude,
      longitude
    });
    res.json({ delivery: serializeDelivery(d) });
  })
);

export default router;
