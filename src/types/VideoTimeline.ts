import { TranscriptSegment } from "./TranscriptSegment";
import { VisualDescription } from "./VisualDescription";

export interface VideoTimeline {
    videoPath: string;
    events: (TranscriptSegment | VisualDescription)[];  
}