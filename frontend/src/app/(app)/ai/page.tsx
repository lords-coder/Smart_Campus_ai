"use client";

import { RoleGuard } from "@/components/auth/guards";
import { PageContainer } from "@/components/layout/page-container";
import { ChatAssistant } from "@/components/ai/chat-assistant";

function AiContent() {
  return (
    <PageContainer
      title="AI Assistant"
      description="Ask questions about attendance, fees and your timetable — answered from SmartCampus data"
    >
      <ChatAssistant />
    </PageContainer>
  );
}

export default function AiPage() {
  return (
    <RoleGuard roles={["STUDENT", "FACULTY", "ADMIN", "PARENT"]}>
      <AiContent />
    </RoleGuard>
  );
}
