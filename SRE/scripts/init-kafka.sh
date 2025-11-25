#!/bin/bash
echo "Waiting for Kafka to be ready..."
sleep 5

echo "Creating topics..."
# Topics with 6 partitions to allow for future scaling without re-partitioning
# "Resharding" Kafka topics online is complex, so over-provisioning is key.
kafka-topics --create --if-not-exists --bootstrap-server kafka:9092 --replication-factor 1 --partitions 6 --topic messages.send
kafka-topics --create --if-not-exists --bootstrap-server kafka:9092 --replication-factor 1 --partitions 6 --topic messages.routing
kafka-topics --create --if-not-exists --bootstrap-server kafka:9092 --replication-factor 1 --partitions 6 --topic messages.delivery
kafka-topics --create --if-not-exists --bootstrap-server kafka:9092 --replication-factor 1 --partitions 1 --topic system.events

echo "Listing topics:"
kafka-topics --list --bootstrap-server kafka:9092

echo "Kafka initialization complete!"
