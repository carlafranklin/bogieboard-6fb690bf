| trigger_sql                                                                                                                                                      |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CREATE TRIGGER trg_business_applications_updated_at BEFORE UPDATE ON business_applications FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()              |
| CREATE TRIGGER trg_business_locations_set_location BEFORE INSERT OR UPDATE ON business_locations FOR EACH ROW EXECUTE FUNCTION business_locations_set_location() |
| CREATE TRIGGER trg_business_locations_updated_at BEFORE UPDATE ON business_locations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()                    |
| CREATE TRIGGER trg_businesses_updated_at BEFORE UPDATE ON businesses FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()                                    |
| CREATE TRIGGER trg_canonical_events_updated BEFORE UPDATE ON canonical_events FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()                           |
| CREATE TRIGGER update_events_updated_at BEFORE UPDATE ON events FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()                                         |
| CREATE TRIGGER update_feed_registry_updated_at BEFORE UPDATE ON feed_registry FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()                           |
| CREATE TRIGGER update_partner_events_updated_at BEFORE UPDATE ON partner_events FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()                         |
| CREATE TRIGGER update_partner_profiles_updated_at BEFORE UPDATE ON partner_profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()                     |
| CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()                                     |
| CREATE TRIGGER trg_sources_updated BEFORE UPDATE ON sources FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()                                             |
| CREATE TRIGGER trg_venues_set_location BEFORE INSERT OR UPDATE ON venues FOR EACH ROW EXECUTE FUNCTION venues_set_location()                                     |