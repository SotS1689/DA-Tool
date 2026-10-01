// Text Flow Instructions 1.6 (Blake Franze), transcribed from the source PDF
// as text so it reads like the other in-app instructions.
//
// Blocks:
//   { h }              section heading
//   { p, level?, indent? }  prose paragraph; level = list depth it sits under;
//                      indent = first-line indent (the PDF's essay paragraphs)
//   { li, marker, level }   list item with a hanging marker ("1.", "a.", "i.")
//   { flow, level? }   Greek example lines. Leading tabs on a line give its
//                      indent (each tab = one step); "" is a blank line.
//                      Wrapped lines stay aligned with their own first line.
// Inline markup: **bold**, *italic*, ***bold italic***, __underline__, ^superscript^.
// The web tool (../index.html) carries an identical copy of this array.

export type TextFlowBlock =
	| { h: string }
	| { p: string; level?: number; indent?: boolean }
	| { li: string; marker: string; level: number }
	| { flow: string[]; level?: number };

export const TEXT_FLOW_INSTRUCTIONS: TextFlowBlock[] = [
	{ h: "Introduction to the “Text Flow”" },
	{ indent: true, p: "You have learned how to do a Sentence Flow, a tool which is designed to grammatically break down a *sentence* into each individual word. When you do exegesis, however, you will need to deal with passages much longer than one sentence. Doing a Sentence Flow on every sentence may not be necessary and can be quite laborious. You should continue to use sentence flowing when needed to help you understand the grammar of complex sentences but, going forward, text flowing will be your primary tool for breaking down a text." },
	{ indent: true, p: "*A **Text Flow** is a tool designed to break down a whole Greek text or passage into individual sentences and clauses.* Its purpose is to help the exegete visually simplify a text in preparation for further exegesis, including *Discourse Analysis*. Once you have completed a Text Flow, you will have your whole passage laid out clause-by-clause. This will help you to be methodical in translating the text. It will help you to more quickly identify how each clause relates to the others. Another benefit to text flowing is that, unlike sentence flowing, you are preserving the original word order of the text. A Text Flow may serve, then, as a good “base text” for making all kinds of exegetical observations and performing different kinds of exegetical analyses, some of which you will learn in Greek III, Hermeneutics, and other upper-level NT classes." },
	{ indent: true, p: "In a Text Flow, the basic distinction you will make is one that you should already know well. It is simply the distinction between “independent” and “dependent” (i.e., subordinate) clauses. Another way to describe the relationship between clauses is with the ideas of “parataxis” (when clauses are *coordinated*) and “hypotaxis” (when one or more clause is *subordinated* to another). You know that a clause is a grammatical unit that consists of a subject and a predicate. Remember that sometimes the subject or the predicate is assumed. See the instructions below for identifying independent and dependent clauses in a Text Flow." },

	{ h: "Instructions for Creating a Text Flow" },
	{ indent: true, p: "**Flow the text by putting each *clause* on a new line, and *indenting* the dependent (i.e., subordinate) clauses.** Work your way through a Greek text from beginning to end, using “enter” and “tab” keys. Use the following Text Flow Guidelines to help you through the process:" },

	{ marker: "1.", level: 0, li: "Every *independent* clause goes on a new line and is left-justified. Every *dependent* clause goes on a new line and is indented *above or below* the clause it modifies (preserving the original word order)." },
	{ marker: "a.", level: 1, li: "Sometimes dependent clauses will be subordinated to other dependent clauses. Sometimes multiple dependent clauses will be lined up under the same independent clause. When an indented (dependent) clause has independent clauses above *and* below it, context tells you which independent clause it modifies. If a clause runs over onto the next line, just align the second line with the first (see **bold** below):" },
	{ level: 2, flow: [
		"καὶ ἔσεσθέ μου μάρτυρες ἔν τε Ἰερουσαλὴμ καὶ [ἐν] πάσῃ τῇ Ἰουδαίᾳ καὶ",
		"**Σαμαρείᾳ καὶ ἕως ἐσχάτου τῆς γῆς**. (Acts 1:8)",
	] },
	{ marker: "b.", level: 1, li: "**Examples:**" },
	{ level: 2, p: "Independent-dependent:" },
	{ level: 2, flow: [
		"καὶ ἰδοὺ σεισμὸς (earthquake) μέγας ἐγένετο ἐν τῇ θαλάσσῃ,",
		"\tὥστε τὸ πλοῖον καλύπτεσθαι (covered) ὑπὸ τῶν κυμάτων, (Matt 8:24)",
	] },
	{ level: 2, p: "Dependent-independent:" },
	{ level: 2, flow: [
		"\tἐπεὶ πολλοὶ καυχῶνται κατὰ σάρκα,",
		"κἀγὼ καυχήσομαι (2 Cor 11:18)",
	] },

	{ marker: "2.", level: 0, li: "Put adverbial participles and attendant circumstance participles (with their subjects, objects, and modifiers) on their own line and indent (e.g., “*After he came*, he entered,” “he won *by running fast*” – the italicized portions are dependent clauses). Examples:" },
	{ level: 1, flow: [
		"\tκαὶ **προσελθόντες**",
		"ἤγειραν αὐτὸν (Matt 8:25)",
		"",
		"οἱ δὲ ἄνθρωποι ἐθαύμασαν",
		"\t**λέγοντες**·",
		"\t… (Matt 8:27)",
		"",
		"\tΚαὶ **ἐμβάντι** αὐτῷ εἰς τὸ πλοῖον",
		"ἠκολούθησαν αὐτῷ οἱ μαθηταὶ αὐτοῦ. (Matt 8:23)",
	] },

	{ marker: "3.", level: 0, li: "Do *not* put substantival, attributive, or periphrastic participles on a separate line." },
	{ level: 1, flow: [
		"\tΚαὶ ἐλθόντος αὐτοῦ εἰς τὸ πέραν εἰς τὴν χώραν τῶν Γαδαρηνῶν",
		"ὑπήντησαν αὐτῷ δύο **δαιμονιζόμενοι** (Matt 8:28)",
		"",
		"Ἀποκαλύπτεται ὀργὴ θεοῦ ἐπὶ ἀδικίαν ἀνθρώπων **τῶν** τὴν ἀλήθειαν **κατεχόντων** (Rom 1:18)",
	] },

	{ marker: "4.", level: 0, li: "Put adverbial infinitives (purpose, result, time, cause, means), together with their subjects, objects, and modifiers, on a new line and indent (e.g., He ran *to meet her at the station* – purpose)." },
	{ level: 1, flow: [
		"ἀπήγαγον αὐτὸν",
		"\tεἰς τὸ **σταυρῶσαι** (Matt 27:31)",
		"",
		"\tμετὰ δὲ τὸ **παραδοθῆναι** τὸν Ἰωάννην",
		"ἦλθεν ὁ Ἰησοῦς εἰς τὴν Γαλιλαίαν (Mark 1:14)",
	] },

	{ marker: "5.", level: 0, li: "Do *not* put substantival, epexegetical, or complementary infinitives (“he is able *to dig*”) on a new line." },
	{ level: 1, flow: [
		"**Γινώσκειν** δὲ ὑμᾶς βούλομαι, ἀδελφοί,",
		"\tὅτι… (Phil 1:12)",
		"",
		"θεὸς γάρ ἐστιν ὁ ἐνεργῶν ἐν ὑμῖν καὶ **τὸ θέλειν** καὶ **τὸ ἐνεργεῖν** ὑπὲρ τῆς εὐδοκίας (Phil 2:13)",
	] },

	{ marker: "6.", level: 0, li: "A protasis (“if…”) is indented (dependent), and an apodosis (“then…”) is independent." },
	{ level: 1, flow: [
		"\t**ἐὰν** ὁμολογῶμεν τὰς ἁμαρτίας ἡμῶν,",
		"πιστός ἐστιν καὶ δίκαιος,",
		"\tἵνα ἀφῇ ἡμῖν τὰς ἁμαρτίας (1 John 1:9)",
	] },

	{ marker: "7.", level: 0, li: "Do not put verbal interjections (e.g., ἰδού – “Behold!”) on their own line." },
	{ level: 1, flow: [
		"**ἰδοὺ** ἐξῆλθεν ὁ σπείρων (Mark 4:3)",
		"",
		"καὶ **ἰδοὺ** φωνὴ ἐκ τῶν οὐρανῶν",
		"\tλέγουσα",
		"\t\tοὗτός ἐστιν ὁ υἱός μου ὁ ἀγαπητός, (Matt 3:17)",
	] },
	{ p: "**But** when ειδον (ιδου\\ιδε) is ***not*** an interjection, flow as you normally would:" },
	{ level: 1, flow: [
		"λέγει αὐτῷ ὁ Φίλιππος·",
		"\tἔρχου",
		"\tκαὶ **ἴδε**. (John 1:46)",
	] },

	{ marker: "8.", level: 0, li: "Discourse clauses (direct or indirect): even if it is independent, indent it under the clause that introduces it. Subsequent clauses are either lined up (if independent) or indented (if dependent); e.g., he answered and said, “*I’ve gone.*” They knew *that he was killed.*" },
	{ level: 1, flow: [
		"καὶ ἰδοὺ ἔκραξαν",
		"\t**λέγοντες**·",
		"\t\tΤί ἡμῖν καὶ σοί, υἱὲ τοῦ θεοῦ;",
		"",
		"\t\tἦλθες ὧδε πρὸ καιροῦ",
		"\t\t\tβασανίσαι ἡμᾶς; (Matt 8:29)",
		"",
		"\tἐὰν **εἴπωμεν**",
		"\t\t**ὅτι** οὐχ ἡμαρτήκαμεν,",
		"ψεύστην ποιοῦμεν αὐτόν (1 John 1:8)",
	] },

	{ marker: "9.", level: 0, li: "Apart from their use in indirect discourse, substantival clauses may be kept on the same line as the clause to which they belong or be indented on their own line. (Relative clauses that lack an antecedent are considered here as substantival clauses.) In deciding whether to separate a substantival clause, it is helpful to consider whether you would treat it as its own proposition in your DA. For example, although ὃν εἶπον in John 1:15 could be indented as its own clause, it is reasonable to take it with οὗτος ἦν as a single proposition, “This is the one about whom I said.” Thus the two clauses may be kept on the same line in the text flow:" },
	{ level: 1, flow: ["οὗτος ἦν ὃν εἶπον"] },
	{ level: 1, p: "Rather than" },
	{ level: 1, flow: [
		"οὗτος ἦν",
		"\tὃν εἶπον",
	] },

	{ marker: "10.", level: 0, li: "Dependent clauses that *interrupt* independent clauses are “embedded clauses.” __Leave them where they are__. Put parentheses () around them. If you wish, you can also italicize them, or change the text color. But do not change the word order of the text." },
	{ marker: "a.", level: 1, li: "Here is an example of a subordinate relative clause embedded between the subject and the verb:" },
	{ level: 2, flow: ["καὶ ἰδοὺ ὁ ἀστήρ, **(ὃν εἶδον ἐν τῇ ἀνατολῇ),** προῆγεν αὐτούς. (Matt 2:9)"] },
	{ marker: "b.", level: 1, li: "You may mark embedded adverbial participles as you would embedded clauses. Here is an example of an embedded relative clause within an embedded adverbial participial (see **bold** below). You can distinguish them by using parentheses for the first and brackets for the second:" },
	{ level: 2, flow: ["ἄχρι ἧς ἡμέρας (**ἐντειλάμενος τοῖς ἀποστόλοις διὰ πνεύματος ἁγίου** [**οὓς ἐξελέξατο**]) ἀνελήμφθη. (Acts 1:2)"] },

	{ marker: "11.", level: 0, li: "Use single space, but *add a blank line* before each *new sentence.*" },

	{ h: "Example 1: Text Flow of Matthew 8:23–29" },
	{ flow: [
		"\t^23^Καὶ ἐμβάντι αὐτῷ εἰς τὸ πλοῖον",
		"ἠκολούθησαν αὐτῷ οἱ μαθηταὶ αὐτοῦ.",
		"",
		"^24^καὶ ἰδοὺ σεισμὸς μέγας ἐγένετο ἐν τῇ θαλάσσῃ,",
		"\tὥστε τὸ πλοῖον καλύπτεσθαι ὑπὸ τῶν κυμάτων,",
		"αὐτὸς δὲ ἐκάθευδεν.",
		"",
		"\t^25^καὶ προσελθόντες",
		"ἤγειραν αὐτὸν",
		"\tλέγοντες·",
		"\t\tΚύριε, σῶσον,",
		"\t\tἀπολλύμεθα.",
		"",
		"^26^καὶ λέγει αὐτοῖς·",
		"\tΤί δειλοί ἐστε, ὀλιγόπιστοι;",
		"",
		"\tτότε ἐγερθεὶς",
		"ἐπετίμησεν τοῖς ἀνέμοις καὶ τῇ θαλάσσῃ,",
		"καὶ ἐγένετο γαλήνη μεγάλη.",
		"",
		"^27^οἱ δὲ ἄνθρωποι ἐθαύμασαν",
		"\tλέγοντες·",
		"\t\tΠοταπός ἐστιν οὗτος",
		"\t\t\tὅτι καὶ οἱ ἄνεμοι καὶ ἡ θάλασσα αὐτῷ ὑπακούουσιν;",
		"",
		"\t^28^Καὶ ἐλθόντος αὐτοῦ εἰς τὸ πέραν εἰς τὴν χώραν τῶν Γαδαρηνῶν",
		"ὑπήντησαν αὐτῷ δύο δαιμονιζόμενοι **(ἐκ τῶν μνημείων ἐξερχόμενοι)** χαλεποὶ λίαν,",
		"\tὥστε μὴ ἰσχύειν τινὰ παρελθεῖν διὰ τῆς ὁδοῦ ἐκείνης.",
		"",
		"^29^καὶ ἰδοὺ ἔκραξαν",
		"\tλέγοντες·",
		"\t\tΤί ἡμῖν καὶ σοί, υἱὲ τοῦ θεοῦ;",
		"",
		"\t\tἦλθες ὧδε πρὸ καιροῦ",
		"\t\t\tβασανίσαι ἡμᾶς;",
	] },

	{ h: "Example 2: Text Flow of 1 John 1:5–10" },
	{ flow: [
		"^5^Καὶ ἔστιν αὕτη ἡ ἀγγελία",
		"\tἣν ἀκηκόαμεν ἀπʼ αὐτοῦ",
		"\tκαὶ ἀναγγέλλομεν ὑμῖν,",
		"\tὅτι ὁ θεὸς φῶς ἐστιν",
		"\tκαὶ σκοτία ἐν αὐτῷ οὐκ ἔστιν οὐδεμία.",
		"",
		"\t^6^ἐὰν εἴπωμεν",
		"\t\tὅτι κοινωνίαν ἔχομεν μετʼ αὐτοῦ",
		"\tκαὶ ἐν τῷ σκότει περιπατῶμεν,",
		"ψευδόμεθα",
		"καὶ οὐ ποιοῦμεν τὴν ἀλήθειαν·",
		"\t^7^ἐὰν ἐν τῷ φωτὶ περιπατῶμεν,",
		"\t\tὡς αὐτός ἐστιν ἐν τῷ φωτί,",
		"κοινωνίαν ἔχομεν μετʼ ἀλλήλων,",
		"καὶ τὸ αἷμα Ἰησοῦ τοῦ υἱοῦ αὐτοῦ καθαρίζει ἡμᾶς ἀπὸ πάσης ἁμαρτίας.",
		"",
		"\t^8^ἐὰν εἴπωμεν",
		"\t\tὅτι ἁμαρτίαν οὐκ ἔχομεν,",
		"ἑαυτοὺς πλανῶμεν",
		"καὶ ἡ ἀλήθεια οὐκ ἔστιν ἐν ἡμῖν.",
		"",
		"\t^9^ἐὰν ὁμολογῶμεν τὰς ἁμαρτίας ἡμῶν,",
		"πιστός ἐστιν καὶ δίκαιος,",
		"\tἵνα ἀφῇ ἡμῖν τὰς ἁμαρτίας",
		"\tκαὶ καθαρίσῃ ἡμᾶς ἀπὸ πάσης ἀδικίας.",
		"",
		"\t^10^ἐὰν εἴπωμεν",
		"\t\tὅτι οὐχ ἡμαρτήκαμεν,",
		"ψεύστην ποιοῦμεν αὐτόν,",
		"καὶ ὁ λόγος αὐτοῦ οὐκ ἔστιν ἐν ἡμῖν.",
	] },

	{ h: "How to go from a Text Flow to Discourse Analysis" },
	{ indent: true, p: "A Text Flow is a tool that makes simple *grammatical* distinctions. Discourse Analysis is a tool for making *semantic* distinctions. A “clause” is a grammatical category that we identify in a Text Flow. It is made up of other grammatical units (i.e., “subject” and “predicate”). A “proposition” is a semantic category that we identify in Discourse Analysis. It is made up of other semantic units (i.e., “topic” and “comment,” each of which are “concepts”). What is important to understand for Discourse Analysis is that *most* propositions are put into written communication in the form of clauses. For example, the idea (or the “proposition”) that your car is red may be communicated in a written *clause* “my car is red.” One clause usually correlates to one proposition." },
	{ indent: true, p: "However, sometimes an author can communicate a proposition in a grammatical unit that is *smaller* than a clause, like a *phrase* (i.e., an adjectival phrase or a prepositional phrase). For example, the two ideas (propositions) that I drink orange juice and that I do so for the sake of God’s glory may be communicated by the one written clause “I drink orange juice to God’s glory.” In this case, we say that “I drink orange juice” is the **explicit** proposition (because it is a complete clause), and we say that “[I drink] to God’s glory” is the **implicit** proposition (because we have to add a verb to make it a clause). __Therefore, we move from a TF to a DA in three steps:__" },
	{ marker: "1)", level: 0, li: "Translate each line (i.e., clause) identified in the TF" },
	{ marker: "a.", level: 1, li: "You have now identified the *explicit propositions*" },
	{ marker: "2)", level: 0, li: "Then, identify and put each *implicit proposition* on its own line as well. As you translate, you will naturally recognize certain phrases smaller than a clause that communicate whole ideas and make a logical contribution to the passage (e.g., “…for the praise of God’s glory,” or “…in Christ,” or “…along with her very own beloved sister”)." },
	{ marker: "a.", level: 1, li: "Sometimes a Greek phrase will naturally translate into an English clause. This is evidence that a whole proposition was packed into that phrase." },
	{ marker: "i.", level: 2, li: "E.g., the adjectival phrase in ὁ πιστεύων εἰς τὸν κύριον ἀνήρ λέγει is translated into English with a relative clause: “The man who believes in the Lord speaks.” In this case, you could identify two propositions like this:" },
	{ marker: "1.", level: 3, li: "The man speaks" },
	{ marker: "2.", level: 3, li: "[that is, the man] who believes in the Lord [speaks]." },
	{ marker: "ii.", level: 2, li: "**However,** in complicated cases like this, you may feel free to simplify the propositions into one: “The man who believes in the Lord speaks.”" },
	{ marker: "b.", level: 1, li: "Distinctions in semantics are just as “real” as those in grammar, but they are sometimes more vague or ambiguous. Therefore, DA involves not only observation, but *interpretation.* It is not always clear-cut. The processes of identifying propositions and naming their logical relationships have rules grounded in how semantics work, but DA (like exegesis in general) is just as much of an “art” as it is a “science.”" },
	{ marker: "3)", level: 0, li: "Place brackets and identify logical relationships, using Beale’s *Interpretive Lexicon.*" },
];
