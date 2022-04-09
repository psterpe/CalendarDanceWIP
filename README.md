# CalendarDance

This is work in progress on both the backend (NodeJS with Typescript) and the user interface (ReactJS) of an application that can read your Internet calendars (with your permission), know when you are free, and help set up meetings between you and others. "Gee, don't Gmail and Outlook already do something like that?" Yes, on their own platform. My code is cross-platform -- it can read Google, Apple, and Microsoft calendars. Other features of this code:

* You can arrange meetings in terms of what you're trying to accomplish, and it knows the times of day when those things tend to happen. For example, you can specify "Breakfast" or "Drinks after work."
* You can specify meeting times in approximate ways such as "this month" or "middle of the week" or "before summer."

CalendarDance proposes meeting days and times based on the free slots it finds that are appropriate for the occasion and timing specified. Your calendars are never visible to others, nor are theirs visible to you. You can keep "the dance" going by proposing an alternative if you'd like a different time slot than the one your friend chose.

Much work remains, but these capabilites are working now:
* User sign-up with email to verify account
* Internet calendar access using OAuth2 authentication (for Google and Microsoft calendars) and app-specific passwords (for Apple calendars)
  * Calendar access via vendor-supplied API for Google and Microsoft and CalDAV for Apple
* Initiate a meeting request. Ways you can specify the timing:
  *  today, tomorrow, on the weekend
  *  on a specific day or in a specific month
  *  by season
  *  early, middle of, or before the end of a week, month, or season
  *  et al.
* Respond to a meeting request that you receive
* Admin view to help test and debug
* Session management

Code has been deployed to Google AppEngine.
