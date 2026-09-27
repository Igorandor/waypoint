# Video publication kit

## Status

An English narrated video and subtitles have been prepared locally as `waypoint-walkthrough.mp4` and `waypoint-walkthrough.srt`. They are delivered separately from the source repository. No YouTube URL is available yet, and no video bonus is claimed. A combined three-project film is also available in the delivery bundle.

The video is an edited sequence of actual application screens, with offline synthesized English narration. It is not a continuous screen recording. Native IRIS operations in the shown workflow are reads; demonstration workflow records were saved in a separate temporary gateway store. Screens contain bundled instance data, not a production customer's records.

## Suggested YouTube title

Waypoint for InterSystems IRIS | Guided product walkthrough

## Suggested description

Create an observation plan, run each step explicitly, and prepare a recorded handover in Waypoint for InterSystems IRIS.

This is an edited, narrated walkthrough of actual application screens. It uses synthesized English narration and English subtitles. The demonstrated workflow reads a running IRIS Community instance; it does not perform native administrative changes.

Source and installation: https://github.com/YOUR_GITHUB_ACCOUNT/waypoint

Companion article: add the published Developer Community URL.

Open Exchange: add the published application URL.

## Before upload

1. Watch the complete MP4 and review the English subtitles. Replace the repository owner and add the real article/application links in the description.
2. Upload the individual video, or use the relevant chapter of the combined video. Review YouTube's requested publication settings yourself. Do not assume multiple uploads multiply the contest bonus.
3. Add the SRT as English captions if desired; readable captions are already burned into the prepared picture. Check for duplicate displayed captions when previewing.
4. Publish the chosen video, verify that viewers can open it, and add its actual URL to the Open Exchange YouTube field and this repository's README. A local MP4 alone is not a published contest video.

## Scene transcript

### 1. Make the work visible

Waypoint organizes InterSystems IRIS work into explicit steps and retained results. This walkthrough uses actual screens from a running instance and a separate demonstration journal. Runbooks shows active work, completed runs, and restoration obligations. We will create a read-only observation report.

### 2. Choose a plan with a clear purpose

New run offers an observation plan and maintenance plans for applications and task scheduling. Maintenance plans remember the target's starting state and require explicit restoration. In this video, choose Observe an instance. That plan reads evidence without disabling an application or suspending a task.

### 3. Review the steps before saving

The observation plan includes identity, system health, host capacity, and recent system messages. Give the run a useful title and inspect the selected sources. Creating the run saves this plan only. It does not execute all the steps in the background.

### 4. A saved plan is not an executed plan

The new run starts with zero of four steps complete. Each pending step is visible. Run next step is the operator's explicit action to continue. This distinction helps another operator understand whether a procedure was merely prepared or whether observations were actually collected.

### 5. Inspect each recorded result

After the first step, select its recorded result to inspect the native product and API identity. The result includes its timestamp and attempt count. The next step remains pending until the operator continues. Recording a response does not certify that the whole instance is healthy.

### 6. Keep measurement scope explicit

Continue through the health and capacity reads. Host observations come from the operating system visible to IRIS. They may differ from container limits. The result keeps that scope visible alongside memory, CPU, uptime, and disk observations, instead of presenting them as unexplained dashboard scores.

### 7. Finish the selected observations

After the bounded system-log read, all four observations are recorded and the run is complete. Its saved results remain available for inspection and reporting. This procedure made no native configuration changes, so it created no restoration obligation.

### 8. Prepare an honest handover

Prepare handover collects an intended recipient, summary, and outstanding risks. Here the note explicitly records that the native system monitor is not configured. Saving the details does not send a message. The delivery checkbox stays clear because no package has been delivered.

### 9. Preserve outcomes and remaining limits

The saved handover sits beside the run results and export actions. It preserves the limitation without claiming recipient acceptance or transferring execution authority. The repository README explains Docker installation, and the companion article covers observation runs, maintenance restoration, and uncertain outcomes.
