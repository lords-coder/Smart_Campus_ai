"use client";

import { Card, CardContent } from "@/components/ui/card";
import { ExternalLink } from "lucide-react";
import type { LearningResource } from "@/lib/types";

interface ResourceCardProps {
  resource: LearningResource;
}

export function ResourceCard({ resource }: ResourceCardProps) {
  const typeIcons: Record<string, string> = {
    VIDEO: "🎥",
    NOTES: "📝",
    PRACTICE: "💪",
    ARTICLE: "📖",
    REMEDIAL: "🏥",
  };

  const typeLabels: Record<string, string> = {
    VIDEO: "Video",
    NOTES: "Notes",
    PRACTICE: "Practice",
    ARTICLE: "Article",
    REMEDIAL: "Remedial",
  };

  return (
    <Card className="h-full">
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className="text-2xl flex-shrink-0">{typeIcons[resource.resource_type] || "📄"}</div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2 mb-1">
              <h4 className="font-medium text-sm text-gray-900 truncate">
                {resource.title}
              </h4>
              <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded">
                {typeLabels[resource.resource_type] || resource.resource_type}
              </span>
            </div>
            <p className="text-sm text-gray-600 mb-2 line-clamp-2">{resource.description}</p>
            <div className="flex items-center gap-2 text-xs text-gray-500 mb-2">
              <span className="px-2 py-0.5 bg-gray-100 rounded">{resource.topic}</span>
              <span className="px-2 py-0.5 bg-gray-100 rounded capitalize">{resource.difficulty}</span>
            </div>
            {resource.url && (
              <a
                href={resource.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800 font-medium"
              >
                View Resource
                <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}