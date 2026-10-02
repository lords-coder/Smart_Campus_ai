import { Router } from "express";
import { requireAuth, requireRole } from "../../middleware/authenticate";
import { validate } from "../../middleware/validate";
import { asyncHandler } from "../../utils/asyncHandler";
import * as hostelController from "./hostel.controller";
import {
  allocateSchema,
  allocationListQuerySchema,
  complaintListQuerySchema,
  createComplaintSchema,
  createHostelSchema,
  createRoomChangeSchema,
  createRoomSchema,
  createVisitorSchema,
  idParamsSchema,
  reviewRoomChangeSchema,
  roomChangeListQuerySchema,
  roomListQuerySchema,
  transferSchema,
  updateComplaintSchema,
  updateVisitorSchema,
  visitorListQuerySchema,
} from "./hostel.schemas";

/** Student self-service. Mounted at /api/hostel. */
const hostelRouter = Router();

hostelRouter.use(requireAuth, requireRole("STUDENT"));

hostelRouter.get("/me", asyncHandler(hostelController.myHostel));
hostelRouter.get("/rooms", validate(roomListQuerySchema, "query"), asyncHandler(hostelController.roomsForStudents));
hostelRouter.get("/complaints", asyncHandler(hostelController.myComplaints));
hostelRouter.post("/complaints", validate(createComplaintSchema), asyncHandler(hostelController.createComplaint));
hostelRouter.get("/room-changes", asyncHandler(hostelController.myRoomChanges));
hostelRouter.post("/room-changes", validate(createRoomChangeSchema), asyncHandler(hostelController.createRoomChange));
hostelRouter.get("/visitors", asyncHandler(hostelController.myVisitors));
hostelRouter.post("/visitors", validate(createVisitorSchema), asyncHandler(hostelController.createVisitor));

/** Admin hostel management. Mounted at /api/admin/hostel. */
const hostelAdminRouter = Router();

hostelAdminRouter.use(requireAuth, requireRole("ADMIN"));

hostelAdminRouter.get("/dashboard", asyncHandler(hostelController.dashboard));
hostelAdminRouter.get("/hostels", asyncHandler(hostelController.hostels));
hostelAdminRouter.post("/hostels", validate(createHostelSchema), asyncHandler(hostelController.createHostel));
hostelAdminRouter.get("/rooms", validate(roomListQuerySchema, "query"), asyncHandler(hostelController.rooms));
hostelAdminRouter.post("/rooms", validate(createRoomSchema), asyncHandler(hostelController.createRoom));
hostelAdminRouter.get(
  "/allocations",
  validate(allocationListQuerySchema, "query"),
  asyncHandler(hostelController.allocations),
);
hostelAdminRouter.post("/allocations", validate(allocateSchema), asyncHandler(hostelController.allocate));
hostelAdminRouter.patch(
  "/allocations/:id/vacate",
  validate(idParamsSchema, "params"),
  asyncHandler(hostelController.vacate),
);
hostelAdminRouter.post(
  "/allocations/:id/transfer",
  validate(idParamsSchema, "params"),
  validate(transferSchema),
  asyncHandler(hostelController.transfer),
);
hostelAdminRouter.get(
  "/complaints",
  validate(complaintListQuerySchema, "query"),
  asyncHandler(hostelController.complaints),
);
hostelAdminRouter.patch(
  "/complaints/:id",
  validate(idParamsSchema, "params"),
  validate(updateComplaintSchema),
  asyncHandler(hostelController.updateComplaint),
);
hostelAdminRouter.get(
  "/room-changes",
  validate(roomChangeListQuerySchema, "query"),
  asyncHandler(hostelController.roomChanges),
);
hostelAdminRouter.patch(
  "/room-changes/:id/review",
  validate(idParamsSchema, "params"),
  validate(reviewRoomChangeSchema),
  asyncHandler(hostelController.reviewRoomChange),
);
hostelAdminRouter.get(
  "/visitors",
  validate(visitorListQuerySchema, "query"),
  asyncHandler(hostelController.visitors),
);
hostelAdminRouter.patch(
  "/visitors/:id",
  validate(idParamsSchema, "params"),
  validate(updateVisitorSchema),
  asyncHandler(hostelController.updateVisitor),
);

export { hostelRouter, hostelAdminRouter };
