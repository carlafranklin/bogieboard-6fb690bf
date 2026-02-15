-- Create a function that maps any source category name to one of the 12 app category slugs
CREATE OR REPLACE FUNCTION public.map_to_app_category(p_source_category text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT CASE
    -- Live Music
    WHEN lower(p_source_category) ~ '(music|concert|band|singer|guitarist|dj|hip-hop|rap|jazz|blues|country|folk|classical|latin|r&b|rock|pop|reggae|metal|punk|indie|soul|gospel|ballad)' THEN 'live-music'
    -- Festivals
    WHEN lower(p_source_category) ~ '(festival|fair|carnival|holi|mardi|fiesta|celebration|jubilee)' THEN 'festivals'
    -- Business
    WHEN lower(p_source_category) ~ '(business|networking|conference|startup|entrepreneur|professional|corporate|trade show|expo|summit)' THEN 'business'
    -- Bar Fun
    WHEN lower(p_source_category) ~ '(bar|nightlife|club|pub|brewery|trivia|karaoke|happy hour|cocktail|wine tasting|beer)' THEN 'bar-fun'
    -- Shopping
    WHEN lower(p_source_category) ~ '(shopping|market|craft fair|flea market|antique|bazaar|sale|vendor|pop-up shop)' THEN 'shopping'
    -- Family & Kids
    WHEN lower(p_source_category) ~ '(family|kids|children|youth|teen|toddler|baby|parenting|storytime|puppet|camp|easter|halloween)' THEN 'family-kids'
    -- Movies
    WHEN lower(p_source_category) ~ '(movie|film|cinema|screening|documentary|animation|drive-in)' THEN 'movies'
    -- Religious & Spiritual
    WHEN lower(p_source_category) ~ '(religious|spiritual|church|worship|faith|prayer|bible|meditation|yoga|mindfulness|retreat|temple|mosque|synagogue)' THEN 'religious-spiritual'
    -- Sports & Games
    WHEN lower(p_source_category) ~ '(sport|game|basketball|football|soccer|baseball|hockey|tennis|golf|racing|marathon|run|walk|fitness|workout|gym|athletic|curling|swimming|aquatic|boxing|wrestling|mma|volleyball)' THEN 'sports-games'
    -- Lecture Series
    WHEN lower(p_source_category) ~ '(lecture|seminar|workshop|class|education|learning|talk|panel|webinar|symposium|course|training|book|reading|author|literary)' THEN 'lecture-series'
    -- Political Events
    WHEN lower(p_source_category) ~ '(political|politics|election|campaign|rally|protest|march|civic|government|town hall|debate|advocacy|activist)' THEN 'political-events'
    -- Arts & Theater
    WHEN lower(p_source_category) ~ '(art|theater|theatre|gallery|museum|exhibit|dance|ballet|opera|play|drama|musical|performance|comedy|standup|stand-up|improv|craft|painting|sculpture|photography)' THEN 'arts-theater'
    -- Default
    ELSE NULL
  END;
$$;