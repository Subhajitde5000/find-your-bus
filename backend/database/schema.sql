-- Active: 1785483683689@@127.0.0.1@5432@find_your_bus
-- PostgreSQL schema for Find Your Bus.
-- Generated from the SQLAlchemy models in backend/app/models.py (pg_dump --schema-only).
-- Regenerate after model changes:  pg_dump --schema-only --no-owner --no-privileges -U postgres -h 127.0.0.1 find_your_bus

--
--

--
-- Name: bus_stands; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bus_stands (
    id integer NOT NULL,
    serial_no integer,
    name character varying(200) NOT NULL,
    local_name character varying(200),
    node_category character varying(80) NOT NULL,
    operator_division character varying(200),
    address text NOT NULL,
    functional_role text,
    latitude numeric(9,6),
    longitude numeric(9,6),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ck_bus_stands_latitude CHECK (((latitude IS NULL) OR ((latitude >= ('-90'::integer)::numeric) AND (latitude <= (90)::numeric)))),
    CONSTRAINT ck_bus_stands_longitude CHECK (((longitude IS NULL) OR ((longitude >= ('-180'::integer)::numeric) AND (longitude <= (180)::numeric)))),
    CONSTRAINT ck_bus_stands_node_category CHECK (((node_category)::text = ANY ((ARRAY['Operational Maintenance Depot'::character varying, 'Major Passenger Terminal'::character varying, 'Route Stand & Transit Node'::character varying])::text[])))
);

--
-- Name: bus_stands_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.bus_stands_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: bus_stands_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.bus_stands_id_seq OWNED BY public.bus_stands.id;

--
-- Name: buses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.buses (
    id integer NOT NULL,
    registration_no character varying(20) NOT NULL,
    registration_key character varying(20) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: buses_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.buses_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: buses_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.buses_id_seq OWNED BY public.buses.id;

--
-- Name: operators; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.operators (
    id integer NOT NULL,
    name character varying(150) NOT NULL
);

--
-- Name: operators_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.operators_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: operators_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.operators_id_seq OWNED BY public.operators.id;

--
-- Name: route_stops; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.route_stops (
    route_id integer NOT NULL,
    sequence integer NOT NULL,
    stop_id integer NOT NULL,
    CONSTRAINT ck_route_stops_sequence CHECK ((sequence > 0))
);

--
-- Name: routes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.routes (
    id integer NOT NULL,
    route_number character varying(40) NOT NULL,
    operator_id integer NOT NULL,
    service_category_id integer NOT NULL,
    origin_stop_id integer NOT NULL,
    destination_stop_id integer NOT NULL,
    origin_label character varying(200) NOT NULL,
    destination_label character varying(200) NOT NULL,
    via_text text,
    fleet_allocation_text character varying(200),
    documented_fleet_count integer,
    source_sheet character varying(80),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ck_routes_fleet_count CHECK (((documented_fleet_count IS NULL) OR (documented_fleet_count >= 0)))
);

--
-- Name: routes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.routes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: routes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.routes_id_seq OWNED BY public.routes.id;

--
-- Name: service_categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.service_categories (
    id integer NOT NULL,
    name character varying(150) NOT NULL
);

--
-- Name: service_categories_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.service_categories_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: service_categories_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.service_categories_id_seq OWNED BY public.service_categories.id;

--
-- Name: stops; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.stops (
    id integer NOT NULL,
    name character varying(200) NOT NULL,
    bus_stand_id integer
);

--
-- Name: stops_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.stops_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: stops_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.stops_id_seq OWNED BY public.stops.id;

--
-- Name: trip_schedules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.trip_schedules (
    id integer NOT NULL,
    trip_id integer NOT NULL,
    direction character varying(10) NOT NULL,
    departure_time time without time zone NOT NULL,
    arrival_time time without time zone NOT NULL,
    CONSTRAINT ck_trip_schedules_direction CHECK (((direction)::text = ANY ((ARRAY['outbound'::character varying, 'return'::character varying])::text[])))
);

--
-- Name: trip_schedules_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.trip_schedules_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: trip_schedules_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.trip_schedules_id_seq OWNED BY public.trip_schedules.id;

--
-- Name: trips; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.trips (
    id integer NOT NULL,
    run_code character varying(60) NOT NULL,
    route_id integer NOT NULL,
    bus_id integer,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: trips_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.trips_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: trips_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.trips_id_seq OWNED BY public.trips.id;

--
-- Name: bus_stands id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bus_stands ALTER COLUMN id SET DEFAULT nextval('public.bus_stands_id_seq'::regclass);

--
-- Name: buses id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.buses ALTER COLUMN id SET DEFAULT nextval('public.buses_id_seq'::regclass);

--
-- Name: operators id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.operators ALTER COLUMN id SET DEFAULT nextval('public.operators_id_seq'::regclass);

--
-- Name: routes id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.routes ALTER COLUMN id SET DEFAULT nextval('public.routes_id_seq'::regclass);

--
-- Name: service_categories id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_categories ALTER COLUMN id SET DEFAULT nextval('public.service_categories_id_seq'::regclass);

--
-- Name: stops id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stops ALTER COLUMN id SET DEFAULT nextval('public.stops_id_seq'::regclass);

--
-- Name: trip_schedules id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trip_schedules ALTER COLUMN id SET DEFAULT nextval('public.trip_schedules_id_seq'::regclass);

--
-- Name: trips id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trips ALTER COLUMN id SET DEFAULT nextval('public.trips_id_seq'::regclass);

--
-- Name: bus_stands bus_stands_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bus_stands
    ADD CONSTRAINT bus_stands_name_key UNIQUE (name);

--
-- Name: bus_stands bus_stands_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bus_stands
    ADD CONSTRAINT bus_stands_pkey PRIMARY KEY (id);

--
-- Name: bus_stands bus_stands_serial_no_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bus_stands
    ADD CONSTRAINT bus_stands_serial_no_key UNIQUE (serial_no);

--
-- Name: buses buses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.buses
    ADD CONSTRAINT buses_pkey PRIMARY KEY (id);

--
-- Name: buses buses_registration_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.buses
    ADD CONSTRAINT buses_registration_key_key UNIQUE (registration_key);

--
-- Name: buses buses_registration_no_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.buses
    ADD CONSTRAINT buses_registration_no_key UNIQUE (registration_no);

--
-- Name: operators operators_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.operators
    ADD CONSTRAINT operators_name_key UNIQUE (name);

--
-- Name: operators operators_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.operators
    ADD CONSTRAINT operators_pkey PRIMARY KEY (id);

--
-- Name: route_stops route_stops_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.route_stops
    ADD CONSTRAINT route_stops_pkey PRIMARY KEY (route_id, sequence);

--
-- Name: routes routes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.routes
    ADD CONSTRAINT routes_pkey PRIMARY KEY (id);

--
-- Name: routes routes_route_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.routes
    ADD CONSTRAINT routes_route_number_key UNIQUE (route_number);

--
-- Name: service_categories service_categories_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_categories
    ADD CONSTRAINT service_categories_name_key UNIQUE (name);

--
-- Name: service_categories service_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_categories
    ADD CONSTRAINT service_categories_pkey PRIMARY KEY (id);

--
-- Name: stops stops_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stops
    ADD CONSTRAINT stops_pkey PRIMARY KEY (id);

--
-- Name: trip_schedules trip_schedules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trip_schedules
    ADD CONSTRAINT trip_schedules_pkey PRIMARY KEY (id);

--
-- Name: trips trips_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trips
    ADD CONSTRAINT trips_pkey PRIMARY KEY (id);

--
-- Name: trips trips_run_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trips
    ADD CONSTRAINT trips_run_code_key UNIQUE (run_code);

--
-- Name: trip_schedules uq_trip_schedules_trip_direction; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trip_schedules
    ADD CONSTRAINT uq_trip_schedules_trip_direction UNIQUE (trip_id, direction);

--
-- Name: ix_bus_stands_local_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_bus_stands_local_name ON public.bus_stands USING btree (local_name);

--
-- Name: ix_route_stops_stop_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_route_stops_stop_id ON public.route_stops USING btree (stop_id);

--
-- Name: ix_routes_operator_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_routes_operator_id ON public.routes USING btree (operator_id);

--
-- Name: ix_routes_service_category_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_routes_service_category_id ON public.routes USING btree (service_category_id);

--
-- Name: ix_stops_bus_stand_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_stops_bus_stand_id ON public.stops USING btree (bus_stand_id);

--
-- Name: ix_trip_schedules_trip_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_trip_schedules_trip_id ON public.trip_schedules USING btree (trip_id);

--
-- Name: ix_trips_bus_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_trips_bus_id ON public.trips USING btree (bus_id);

--
-- Name: ix_trips_route_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_trips_route_id ON public.trips USING btree (route_id);

--
-- Name: uq_stops_name_ci; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_stops_name_ci ON public.stops USING btree (lower((name)::text));

--
-- Name: route_stops route_stops_route_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.route_stops
    ADD CONSTRAINT route_stops_route_id_fkey FOREIGN KEY (route_id) REFERENCES public.routes(id) ON DELETE CASCADE;

--
-- Name: route_stops route_stops_stop_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.route_stops
    ADD CONSTRAINT route_stops_stop_id_fkey FOREIGN KEY (stop_id) REFERENCES public.stops(id) ON DELETE RESTRICT;

--
-- Name: routes routes_destination_stop_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.routes
    ADD CONSTRAINT routes_destination_stop_id_fkey FOREIGN KEY (destination_stop_id) REFERENCES public.stops(id) ON DELETE RESTRICT;

--
-- Name: routes routes_operator_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.routes
    ADD CONSTRAINT routes_operator_id_fkey FOREIGN KEY (operator_id) REFERENCES public.operators(id) ON DELETE RESTRICT;

--
-- Name: routes routes_origin_stop_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.routes
    ADD CONSTRAINT routes_origin_stop_id_fkey FOREIGN KEY (origin_stop_id) REFERENCES public.stops(id) ON DELETE RESTRICT;

--
-- Name: routes routes_service_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.routes
    ADD CONSTRAINT routes_service_category_id_fkey FOREIGN KEY (service_category_id) REFERENCES public.service_categories(id) ON DELETE RESTRICT;

--
-- Name: stops stops_bus_stand_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stops
    ADD CONSTRAINT stops_bus_stand_id_fkey FOREIGN KEY (bus_stand_id) REFERENCES public.bus_stands(id) ON DELETE SET NULL;

--
-- Name: trip_schedules trip_schedules_trip_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trip_schedules
    ADD CONSTRAINT trip_schedules_trip_id_fkey FOREIGN KEY (trip_id) REFERENCES public.trips(id) ON DELETE CASCADE;

--
-- Name: trips trips_bus_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trips
    ADD CONSTRAINT trips_bus_id_fkey FOREIGN KEY (bus_id) REFERENCES public.buses(id) ON DELETE SET NULL;

--
-- Name: trips trips_route_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trips
    ADD CONSTRAINT trips_route_id_fkey FOREIGN KEY (route_id) REFERENCES public.routes(id) ON DELETE CASCADE;

--
--

