### redesign / enhancement of autonomous swe kit

## new goals

# refine down to four implementation options

A/ full cursor no cloud agents
B/ full claude code
C/ use only project files to manage agile requirements and implementation status OR that plus Linear
D/ use mempalace or mcp_memory_service

use ./cursor/*.* as examples of A

# move closer to fully autonomous

full autonomous mode - i want the user to be able to install via guided TUI, which runs the full setup, 
automatically does the project_onboarding workflows and foundation cicd workflows, and then allows the user to commence full autonomous build.

1/ expand/refine the workflows to be better and handle more activities automatically
 - update the project onboarding workflow
 - refine the implement workflow
	- to ensure it can run autonomously without user input by default
 - add a release workflow 
	- that runs the full test regression suite against main or a release branch derived from main to ensure all regression tests pass in ci/cd / githib ci and deploys to that taregt environment
 - add a foundation_cicd workflow that uses the test-architect, architect, planner, ux-expert in party mode to define the target environments, build and release workflows and ci/cd with
automated quality gating (i.e. what types of automated test must run and pass to promote code changes or releases) 

2/ align  autonomous implementation workflow to the canonical code branching stategy
main
- PR to branch to implement stories / features
- add code and progression tests on branch
- all progression test pass locally (dev), and again in github ci
- PR merged back to main
- full regression suite is expanded by progression tests from PR
- github ci for full regression is run, fixes implemented for failing tests
- main is fully updated with merged PR and passing regression suite

release 
- create release rbanch for target environment
- run full ci regression suite - fix on fails
- passing ci -> deploy 

(if there are potential improvements to this, improve)

2/ update instructions for use

/autonomous <project_name> - implements everything in the project requirements (if onboarding and foundation cicd workflows have been run)
 - epic 0 is still successful "hello world" to each target environment
 - then iterate through /autonomous <story_id> until done
 
/autononmous <epic> OR <story_id> invokes the implement workflow to build that story on a PR branch, 
  - invokes the current implementation loop (if epic, iterates through the stories in the epic running the implement loop on each until done)
  - pulls the story context from /project/requirements/<story_id>.md (AND gets same from Linear if linear option installed)
  - updates /project/implementation/_implementation_status.md for story_id (AND pushes in progress status to Linear issue with that story_id if Linear installed)
  - invokes test-architect to define tests (acceptance criteria) for this story 
  - invokes planner to create design (no human approval required)
  - invokes coder (new agent) with all the appropriate context to build (if this is neccessary as implementer is orchestrator, maybe we do need this new agent for actually code changes)
  - creates (story) progression tests
  - runs tests against code & fixes until passing
  - adds progression tests to regression suite
  - check in PR on branch
  - validates github ci passes ( & fixes if not with fix PRs on branch until passing)
  - merges back to main, which invokes github ci of full regression test suite
  - validates full (github ci) regession is passing - if not fixes and passes
  
3/ add a new agent - the auto-swe-advisor - with a workflow that can be run manually to review agent logging, error logs, etc and fix the configuration, or suggest updates to the 
autonomous-swe-kit to prevent errors, failures, or improve, or redesign for a new context.
  
# better and more refined project setup

I want to build a TUI program that guides the user through full install of only two variants
  1/ full cursor no cloud agents OR
  2/ full claude code
and
  3/ use only /project/requirements/epics.md, /project/requirements/<story-id>.md or use this AND  
  4/ use Linear for agile project management
  
and then automatically scan for the prerequite programs (node, speckit, github cli) and install if missing, adjust the workflows, rules and hooks (to update the /project/requirements/*.md and /project/implementation/_implementation_status.md) 
but only interact with Linear to create initial project implementation tasks (project, epics tagged with feature, issues aligned to story-id, implementing epics)
and update status post implementation if Linear was selected

and determines if they are on windows or unix / mac so we can detail the install and the onboarding correctly

## issues to resolve
- difficult to get project setup
- want to keep all the autonomous-swe-kit changes to hooks, rules, scripts (for windows vs unix), auto-diary etc but improve further
- missing workflows
- analyst workflow didn't work well enough to reuse existing docs from /docs/_seed/
- need 'initial_solutioning' workflow to create (or reuse) architecture.md, tech-stack.md, and design.md (if in /docs/_seed/) BMAD style structured workflow with steps 
and quality review and defined outputs but leverages BMAD style party mode to use the required agents to get high quality 
- need an intial document 'project_implementation_plan' workflow to document project requirements in agile epics and stories, then push to Linear if required.
- need 'create_foundation' workflow to define and design epic 0 cicd foundation, automated test architecture needed, taregt environments etc again BMAD style workflow leveraging party mode among our agents.
- epics and stories created by onboarding flow when pushed to Linear not aligned to Linear project / feature / issue heirarchy 
and status in Linear not updated correctly or reliably by current rules and hooks in the implement workflow
- not reliably running autonomously
- not reliably invoking the correct agent personas for workflows