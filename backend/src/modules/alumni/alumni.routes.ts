import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireRole } from "../../middleware/authenticate";
import { validate } from "../../middleware/validate";
import { asyncHandler } from "../../utils/asyncHandler";
import * as alumniController from "./alumni.controller";
import {
  createCampaignSchema,
  createContributionSchema,
  createEventSchema,
  createMentorshipSchema,
  directoryQuerySchema,
  idParamsSchema,
  updateCampaignSchema,
  updateContributionSchema,
  updateEventSchema,
  updateMentorshipSchema,
  updateMyProfileSchema,
  adminUpdateProfileSchema,
} from "./alumni.schemas";

const profileListQuerySchema = z.object({
  status: z.enum(["PENDING", "ALUMNI", "INACTIVE"]).optional(),
  verification: z.enum(["UNVERIFIED", "VERIFIED"]).optional(),
});

const mentorshipListQuerySchema = z.object({
  status: z.enum(["REQUESTED", "ACCEPTED", "REJECTED", "COMPLETED", "CANCELLED"]).optional(),
});

const eventListQuerySchema = z.object({
  status: z.enum(["DRAFT", "PUBLISHED", "CLOSED", "CANCELLED", "COMPLETED"]).optional(),
});

const contributionsQuerySchema = z.object({
  campaignId: z.string().uuid().optional(),
});

/**
 * Shared alumni surface: directory + events + campaigns.
 * STUDENT, FACULTY, ALUMNI read; ADMIN manages. PARENT has no access.
 */
const alumniRouter = Router();

alumniRouter.use(requireAuth);

alumniRouter.get(
  "/directory",
  requireRole("STUDENT", "FACULTY", "ALUMNI", "ADMIN"),
  validate(directoryQuerySchema, "query"),
  asyncHandler(alumniController.directory),
);
alumniRouter.get(
  "/directory/:id",
  requireRole("STUDENT", "FACULTY", "ALUMNI", "ADMIN"),
  validate(idParamsSchema, "params"),
  asyncHandler(alumniController.directoryProfile),
);
alumniRouter.get(
  "/events",
  requireRole("STUDENT", "FACULTY", "ALUMNI", "ADMIN"),
  asyncHandler(alumniController.eventsForRole),
);
alumniRouter.get(
  "/campaigns",
  requireRole("STUDENT", "ALUMNI", "ADMIN"),
  asyncHandler(alumniController.campaigns),
);

// Alumni self-service.
alumniRouter.get("/me/profile", requireRole("ALUMNI"), asyncHandler(alumniController.myProfile));
alumniRouter.patch(
  "/me/profile",
  requireRole("ALUMNI"),
  validate(updateMyProfileSchema),
  asyncHandler(alumniController.updateMyProfile),
);
alumniRouter.get("/me/mentorships", requireRole("ALUMNI"), asyncHandler(alumniController.myMentoring));
alumniRouter.patch(
  "/me/mentorships/:id",
  requireRole("ALUMNI"),
  validate(idParamsSchema, "params"),
  validate(updateMentorshipSchema),
  asyncHandler(alumniController.reviewMentorship),
);
alumniRouter.get("/me/contributions", requireRole("ALUMNI"), asyncHandler(alumniController.myContributions));
alumniRouter.post(
  "/me/contributions",
  requireRole("ALUMNI"),
  validate(createContributionSchema),
  asyncHandler(alumniController.pledgeContribution),
);
alumniRouter.get("/me/dashboard", requireRole("ALUMNI"), asyncHandler(alumniController.alumniDashboard));

// Student self-service.
alumniRouter.get("/me/mentorship-requests", requireRole("STUDENT"), asyncHandler(alumniController.myRequests));
alumniRouter.post(
  "/mentorships",
  requireRole("STUDENT"),
  validate(createMentorshipSchema),
  asyncHandler(alumniController.requestMentorship),
);
alumniRouter.post(
  "/mentorships/:id/cancel",
  requireRole("STUDENT"),
  validate(idParamsSchema, "params"),
  asyncHandler(alumniController.cancelMentorship),
);
alumniRouter.get("/me/registrations", requireRole("STUDENT", "ALUMNI", "FACULTY"), asyncHandler(alumniController.myRegistrations));
alumniRouter.post(
  "/events/:id/register",
  requireRole("STUDENT", "ALUMNI", "FACULTY", "ADMIN"),
  validate(idParamsSchema, "params"),
  asyncHandler(alumniController.registerForEvent),
);
alumniRouter.post(
  "/events/:id/cancel",
  requireRole("STUDENT", "ALUMNI", "FACULTY", "ADMIN"),
  validate(idParamsSchema, "params"),
  asyncHandler(alumniController.cancelRegistration),
);

/** Admin alumni management. Mounted at /api/admin/alumni. */
const alumniAdminRouter = Router();

alumniAdminRouter.use(requireAuth, requireRole("ADMIN"));

alumniAdminRouter.get("/profiles", validate(profileListQuerySchema, "query"), asyncHandler(alumniController.adminProfiles));
alumniAdminRouter.patch(
  "/profiles/:id",
  validate(idParamsSchema, "params"),
  validate(adminUpdateProfileSchema),
  asyncHandler(alumniController.adminUpdateProfile),
);
alumniAdminRouter.get(
  "/mentorships",
  validate(mentorshipListQuerySchema, "query"),
  asyncHandler(alumniController.adminMentorships),
);
alumniAdminRouter.get("/events", validate(eventListQuerySchema, "query"), asyncHandler(alumniController.adminEvents));
alumniAdminRouter.post("/events", validate(createEventSchema), asyncHandler(alumniController.createEvent));
alumniAdminRouter.patch(
  "/events/:id",
  validate(idParamsSchema, "params"),
  validate(updateEventSchema),
  asyncHandler(alumniController.updateEvent),
);
alumniAdminRouter.get(
  "/events/:id/registrations",
  validate(idParamsSchema, "params"),
  asyncHandler(alumniController.eventRegistrations),
);
alumniAdminRouter.patch(
  "/registrations/:id/attend",
  validate(idParamsSchema, "params"),
  asyncHandler(alumniController.markAttendance),
);
alumniAdminRouter.get("/campaigns", asyncHandler(alumniController.adminCampaigns));
alumniAdminRouter.post("/campaigns", validate(createCampaignSchema), asyncHandler(alumniController.createCampaign));
alumniAdminRouter.patch(
  "/campaigns/:id",
  validate(idParamsSchema, "params"),
  validate(updateCampaignSchema),
  asyncHandler(alumniController.updateCampaign),
);
alumniAdminRouter.get(
  "/contributions",
  validate(contributionsQuerySchema, "query"),
  asyncHandler(alumniController.contributions),
);
alumniAdminRouter.post(
  "/contributions",
  validate(createContributionSchema),
  asyncHandler(alumniController.recordContribution),
);
alumniAdminRouter.patch(
  "/contributions/:id",
  validate(idParamsSchema, "params"),
  validate(updateContributionSchema),
  asyncHandler(alumniController.updateContribution),
);
alumniAdminRouter.get("/analytics", asyncHandler(alumniController.analytics));

export { alumniRouter, alumniAdminRouter };
