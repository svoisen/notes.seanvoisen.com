---
tags:
  - type/evergreen
  - topic/learning
  - topic/programming
---
Alan Kay and team learned in the attempt to teach kids to use Smalltalk as a medium for expression that it's not nearly enough to have a great environment, tool or programming language. Literacy in a new medium doesn't naturally *just happen* because children have access to that medium. What Kay and the Xerox LRG team at PARC learned—painfully, over years—is that it also requires good teachers, good curriculum, and a culture that supports the kind of literacy one is aiming for. 

One particular difficulty to overcome involves the ratcheting up from simple foundational concepts towards more sophisticated concepts that unlock specific ways of thinking with the medium. For instance, in the case of programming, Kay notes that efforts to build literacy in programming ...

>... have little to do with the various features of the programming languages used, and everything to do with the difficulties novices have thinking the special way that good programmers think.

He draws an example from architecture: Some ideas are like the arch in building design: "very hard to discover, if you don't already know them." Programming is rife with these unintuitive ideas—patterns and ways of thinking that only seem obvious after you are introduced to them and they simply become part of your thinking repertoire.

It leads me to wonder if programming environments for kids or other environments where we are trying to introduce a specific media literacy can help with the introduction of these "hard to discover" concepts?

Kay writes:

>Tools provide a path, a context, and almost an excuse for developing enlightenment, but no tool ever contained it or can dispense it.

This is, of course, the role of the teacher. But could the design of the environment or the tool play a better part? I think the answer is yes. 

As a small example, I was recently teaching my son to program microcontrollers using Microsoft's MakeCode, which offers a block-based programming environment similar to Scratch. At one point we needed to map numbers in one range coming from an accelerometer into numbers in a different range that we could use for controlling a servo. Range mapping is a non-intuitive mathematical concept for a fourth grader. While my son clearly understood the problem we faced—especially since he was physically holding the two physical components with mismatched ranges—he didn't know how to go about solving it. While MakeCode had already encapsulated the `map` function as a single block, there was no way for him to know that this was the block he needed. The solution was available, right in front of him, but without a handle on the name or label, there was no way for him to grasp it.

Visual programming environments can and should make it easy for a user to get answers to requests like: "I want to do something like this but I don't know the name of the thing that will help me."

## References

Kay, A. (1996) The Early History of Smalltalk.